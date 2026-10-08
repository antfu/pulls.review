import type { GitlabNoteJson } from './review-api'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { ReviewDataSchema } from '../../types/comment-threads'
import { normalizeReviewData } from './review-normalize'
import { renderSharedAnalysisNote } from './sharing'

const url = 'https://gitlab.com/g/p/-/merge_requests/1'
const ada = { id: 1, username: 'ada', avatar_url: 'https://gitlab.com/ada.png' }
const position = { position_type: 'text', base_sha: 'base', start_sha: 'start', head_sha: 'head', old_path: 'a.ts', new_path: 'a.ts', new_line: 5 }

function note(id: number, overrides: Partial<GitlabNoteJson> = {}): GitlabNoteJson {
  return { id, type: null, body: `note ${id}`, author: ada, created_at: `2026-01-0${id}T00:00:00Z`, updated_at: `2026-01-0${id}T00:00:00Z`, system: false, ...overrides }
}

function normalize(discussions: { id: string, notes: GitlabNoteJson[] }[], approved_by: { user: typeof ada, approved_at?: string }[] = []) {
  return normalizeReviewData({ discussions, approvals: { approved_by }, headSha: 'head', url })
}

describe('gitlab normalizeReviewData', () => {
  it('turns a diff discussion into a thread with its replies', () => {
    const data = normalize([{
      id: 'd1',
      notes: [
        note(1, { type: 'DiffNote', position, resolvable: true, resolved: false }),
        note(2, { type: 'DiffNote', position, resolvable: true, resolved: false, author: null }),
      ],
    }])

    expect(v.is(ReviewDataSchema, data)).toBe(true)
    expect(data.threads).toEqual([{
      rootId: 1,
      path: 'a.ts',
      side: 'additions',
      line: 5,
      outdated: false,
      resolved: false,
      threadId: 'd1',
      pending: false,
      comments: [
        { id: 1, author: { login: 'ada', avatarUrl: 'https://gitlab.com/ada.png' }, body: 'note 1', createdAt: '2026-01-01T00:00:00Z', url: `${url}#note_1`, pending: false },
        { id: 2, author: undefined, body: 'note 2', createdAt: '2026-01-02T00:00:00Z', url: `${url}#note_2`, pending: false },
      ],
    }])
    expect(data.pendingReview).toBeUndefined()
  })

  it('reads a thread as resolved once every resolvable note is', () => {
    const resolved = { type: 'DiffNote', position, resolvable: true, resolved: true }
    const [done, open] = normalize([
      { id: 'd1', notes: [note(1, resolved), note(2, resolved)] },
      { id: 'd2', notes: [note(3, resolved), note(4, { ...resolved, resolved: false })] },
    ]).threads

    expect(done!.resolved).toBe(true)
    expect(open!.resolved).toBe(false)
  })

  it('marks a thread on an older version of the diff as outdated, without a line', () => {
    const [thread] = normalize([{ id: 'd1', notes: [note(1, { type: 'DiffNote', position: { ...position, head_sha: 'older' } })] }]).threads
    expect(thread).toMatchObject({ outdated: true, path: 'a.ts' })
    expect(thread!.line).toBeUndefined()
  })

  it('lists approvals, then each comment on the merge request, as summaries', () => {
    const data = normalize([
      { id: 'd1', notes: [note(1), note(2, { type: 'DiscussionNote' })] },
    ], [{ user: { ...ada, id: 7 }, approved_at: '2026-01-05T00:00:00Z' }])

    expect(data.threads).toEqual([])
    expect(data.summaries).toEqual([
      { id: -7, author: { login: 'ada', avatarUrl: 'https://gitlab.com/ada.png' }, state: 'approved', body: '', submittedAt: '2026-01-05T00:00:00Z' },
      { id: 1, author: { login: 'ada', avatarUrl: 'https://gitlab.com/ada.png' }, state: 'commented', body: 'note 1', submittedAt: '2026-01-01T00:00:00Z', url: `${url}#note_1` },
      { id: 2, author: { login: 'ada', avatarUrl: 'https://gitlab.com/ada.png' }, state: 'commented', body: 'note 2', submittedAt: '2026-01-02T00:00:00Z', url: `${url}#note_2` },
    ])
  })

  it('leaves out system notes and shared analyses', () => {
    const shared = renderSharedAnalysisNote('gitlab.com', { project: 'g/p', iid: '1' }, 'ada', {
      headSha: 'head',
      result: { source: 'llm', generatedAt: '2026-01-01T00:00:00Z', schemaVersion: 1, groups: [] },
    })
    const data = normalize([
      { id: 'd1', notes: [note(1, { system: true, body: 'added 1 commit' })] },
      { id: 'd2', notes: [note(2, { body: shared })] },
    ])

    expect(data).toEqual({ threads: [], summaries: [], pendingReview: undefined })
  })
})
