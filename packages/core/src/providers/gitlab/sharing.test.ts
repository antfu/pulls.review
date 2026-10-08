import type { SharedAnalysis } from '../../types/shared-analysis'
import type { Credentials } from '../../types/source'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSharedAnalysisBody } from '../shared-analysis-body'
import { createGitlabClient } from './client'
import { createGitlabSharingApi, gitlabSitePath, renderSharedAnalysisNote } from './sharing'

const mr = { project: 'group/sub/project', iid: '12' }
const API = 'https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/merge_requests/12'
const PAGE = 'https://gitlab.com/group/sub/project/-/merge_requests/12'
const credentials: Credentials = { githubToken: async () => undefined, gitlabToken: async () => 'tok' }

const analysis: SharedAnalysis = {
  headSha: 'abc1234def5678',
  result: {
    source: 'llm',
    model: 'anthropic/claude-sonnet-4',
    generatedAt: '2026-09-28T12:34:56.000Z',
    schemaVersion: 1,
    locale: 'fr',
    groups: [{ key: 'core', label: 'Core', summary: 'Main change.', filePaths: ['src/a.ts'] }],
  },
}

function note(id: number, username: string, body: string, updated_at = '2026-01-01T00:00:00Z') {
  return { id, type: null, body, author: { username, avatar_url: null }, created_at: updated_at, updated_at, system: false }
}

/** Serves `notes` for the listing, and records every write. */
function stubNotes(notes: ReturnType<typeof note>[], update: (id: string) => Response | undefined = () => undefined) {
  const writes: { method: string, url: string, body: { body: string } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (!init.method || init.method === 'GET')
      return new Response(JSON.stringify(notes))
    writes.push({ method: init.method, url: url.slice(API.length), body: JSON.parse(init.body as string) })
    const id = url.match(/notes\/(\d+)$/)?.[1]
    return (id && update(id)) || new Response(JSON.stringify({ id: Number(id ?? 99) }))
  }))
  return writes
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderSharedAnalysisNote', () => {
  it('uses the shared comment format, linking back to the merge request with ?from=', () => {
    const body = renderSharedAnalysisNote('gitlab.com', mr, 'ada', analysis)

    expect(body.split('\n')[0]).toBe('<!-- pulls.review data -->')
    expect(body).toContain('Review this merge request')
    expect(body).toContain('https://pulls.review/gl/group/sub/project/-/merge_requests/12?from=ada')
    expect(body).toContain('head abc1234')
  })

  it('round-trips the head sha and locale through parse', () => {
    expect(parseSharedAnalysisBody(renderSharedAnalysisNote('gitlab.com', mr, 'ada', analysis))).toEqual(analysis)
  })

  it('names another instance in the link, so it can never read as a gitlab.com project', () => {
    expect(gitlabSitePath('gitlab.example.com', mr)).toBe('/gl/@gitlab.example.com/group/sub/project/-/merge_requests/12')
  })
})

describe('gitlab sharing', () => {
  const sharing = () => createGitlabSharingApi(createGitlabClient('gitlab.com', credentials), mr)
  const body = renderSharedAnalysisNote('gitlab.com', mr, 'ada', analysis)

  it('lists the marked notes with their authors, ignoring every other note', async () => {
    stubNotes([note(3, 'ada', body), note(2, 'bob', 'plain comment'), note(1, 'cy', '<!-- pulls.review data -->\nbroken')])

    expect(await sharing().list()).toEqual([
      { id: 3, login: 'ada', url: `${PAGE}#note_3`, updatedAt: '2026-01-01T00:00:00Z', analysis },
    ])
  })

  it('asks for the most recently updated notes in one request', async () => {
    stubNotes([])
    await sharing().list()
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual([`${API}/notes?order_by=updated_at&sort=desc&per_page=100`])
  })

  it('posts a new note when the viewer has shared nothing yet', async () => {
    const writes = stubNotes([note(2, 'bob', body)])

    expect(await sharing().upsert('ada', analysis)).toEqual({ id: 99, url: `${PAGE}#note_99` })
    expect(writes).toEqual([{ method: 'POST', url: '/notes', body: { body } }])
  })

  it('updates the viewer\'s own note instead of posting a second one', async () => {
    const writes = stubNotes([note(2, 'bob', body), note(7, 'ada', body)])

    expect(await sharing().upsert('ada', analysis)).toEqual({ id: 7, url: `${PAGE}#note_7` })
    expect(writes.map(({ method, url }) => [method, url])).toEqual([['PUT', '/notes/7']])
  })

  it('updates the remembered note without scanning', async () => {
    const writes = stubNotes([])

    await sharing().upsert('ada', analysis, { id: 7 })

    expect(writes.map(({ method, url }) => [method, url])).toEqual([['PUT', '/notes/7']])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('falls back to the scan when the remembered note was deleted', async () => {
    const writes = stubNotes([], id => id === '7' ? new Response(JSON.stringify({ message: '404 Not found' }), { status: 404 }) : undefined)

    expect(await sharing().upsert('ada', analysis, { id: 7 })).toEqual({ id: 99, url: `${PAGE}#note_99` })
    expect(writes.map(({ method, url }) => [method, url])).toEqual([['PUT', '/notes/7'], ['POST', '/notes']])
  })

  it('reports a refused share as writeForbidden', async () => {
    stubNotes([], () => new Response(JSON.stringify({ message: '403 Forbidden' }), { status: 403 }))
    await expect(sharing().upsert('ada', analysis, { id: 7 })).rejects.toMatchObject({ name: 'writeForbidden' })
  })
})
