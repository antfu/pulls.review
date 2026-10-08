import type { Credentials } from '../../types/source'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitlabMergeRequestSource } from './index'

const ref = { host: 'gitlab.com', project: 'group/sub/project', iid: '12' }
const API = 'https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/merge_requests/12'
const credentials: Credentials = { githubToken: async () => undefined, gitlabToken: async () => 'tok' }

function mergeRequest(headSha = 'head') {
  return {
    title: 'MR',
    description: null,
    state: 'opened',
    draft: false,
    author: null,
    source_branch: 'feat',
    target_branch: 'main',
    sha: headSha,
    diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: headSha },
    web_url: 'https://gitlab.com/group/sub/project/-/merge_requests/12',
    created_at: '',
    updated_at: '',
    changes_count: '1',
  }
}

const diffs = [{ old_path: 'a.ts', new_path: 'a.ts', new_file: false, renamed_file: false, deleted_file: false, diff: '@@ -1,2 +1,2 @@\n keep\n-old\n+new\n' }]

interface Call { method: string, url: string, body?: unknown, auth: string | null }

/** Answers each request by the first route whose key its `METHOD url` ends with; records every call. */
function stubGitlab(routes: Record<string, (call: Call) => Response | unknown>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      method: init.method ?? 'GET',
      url: url.replace(/[?&]per_page=100&page=1$/, ''),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init.headers).get('Authorization'),
    }
    calls.push(call)
    const route = Object.entries(routes).find(([key]) => `${call.method} ${call.url}`.endsWith(key))
    if (!route)
      return new Response(JSON.stringify({ message: '404 Not Found' }), { status: 404 })
    const answer = route[1](call)
    return answer instanceof Response ? answer : new Response(JSON.stringify(answer))
  }))
  return calls
}

const read = {
  [`GET ${API}`]: () => mergeRequest(),
  [`GET ${API}/diffs`]: () => diffs,
  [`GET ${API}/commits`]: () => [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gitlab merge request source', () => {
  it('knows its cache key without a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await createGitlabMergeRequestSource(ref).key()).toBe('gitlab:gitlab.com/group/sub/project!12')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches a payload anonymously, and fingerprints by head sha', async () => {
    const calls = stubGitlab(read)
    const source = createGitlabMergeRequestSource(ref)

    const diff = await source.fetch()

    expect(diff.ref).toEqual({ kind: 'gitlab-mr', ...ref })
    expect(diff.files).toHaveLength(1)
    expect(await source.fingerprint()).toBe('head')
    expect(await source.viewer()).toBeUndefined()
    expect(calls.every(call => call.auth === null)).toBe(true)
    expect(source.auth).toBe('gitlab-token')
  })

  it('works on an instance without the raw diff endpoint', async () => {
    stubGitlab(read)
    const diff = await createGitlabMergeRequestSource(ref).fetch()
    expect(diff.files[0]!.sha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('sends the token with every request once there is one', async () => {
    const calls = stubGitlab(read)
    await createGitlabMergeRequestSource(ref, credentials).fetch()
    expect(calls.every(call => call.auth === 'Bearer tok')).toBe(true)
  })

  it('loads a file by its fully encoded path, and reads a missing one as absent', async () => {
    const calls = stubGitlab({ 'files/src%2Fa%20b.ts/raw?ref=head': () => new Response('content') })
    const source = createGitlabMergeRequestSource(ref)

    expect(await source.loadFile('src/a b.ts', 'head')).toBe('content')
    expect(await source.loadFile('gone.ts', 'base')).toBeUndefined()
    expect(calls[0]!.url).toBe('https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/repository/files/src%2Fa%20b.ts/raw?ref=head')
  })

  it('reports who the token acts as, and lets only the api scope write', async () => {
    stubGitlab({})
    const viewer = (scopes: string[]) => createGitlabMergeRequestSource(ref, credentials, { tokenMeta: async () => ({ login: 'ada', scopes }) }).viewer()

    expect(await viewer(['api'])).toEqual({ login: 'ada', canWrite: true })
    expect(await viewer(['read_api'])).toEqual({ login: 'ada', canWrite: false })
    expect(await viewer([])).toEqual({ login: 'ada', canWrite: true })
  })
})

describe('gitlab reviews', () => {
  const discussion = { id: 'd1', notes: [{ id: 5, type: 'DiffNote', body: 'hm', author: null, created_at: '', updated_at: '', system: false, resolvable: true, resolved: false, position: { position_type: 'text', base_sha: 'base', start_sha: 'start', head_sha: 'head', old_path: 'a.ts', new_path: 'a.ts', new_line: 2 } }] }
  const reviewRoutes = {
    ...read,
    [`GET ${API}/discussions`]: () => [discussion],
    [`GET ${API}/approvals`]: () => ({ approved_by: [] }),
  }

  it('offers neither pending reviews nor requesting changes', () => {
    expect(createGitlabMergeRequestSource(ref).reviews.supports).toEqual({ pendingReview: false, requestChanges: false })
  })

  it('fetches threads anchored in the current diff', async () => {
    stubGitlab(reviewRoutes)
    const { threads } = await createGitlabMergeRequestSource(ref, credentials).reviews.fetch()
    expect(threads).toMatchObject([{ rootId: 5, threadId: 'd1', path: 'a.ts', side: 'additions', line: 2, outdated: false }])
  })

  it('places a comment on the version the reviewer loaded, fetching it when the diff came from the cache', async () => {
    const calls = stubGitlab({ ...reviewRoutes, [`POST ${API}/discussions`]: () => ({}) })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await reviews.addComment({ target: { path: 'a.ts', side: 'additions', line: 2 }, body: 'why?', mode: 'single', headSha: 'head' })

    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      body: { body: 'why?', position: { position_type: 'text', base_sha: 'base', start_sha: 'start', head_sha: 'head', old_path: 'a.ts', new_path: 'a.ts', new_line: 2 } },
    })
  })

  it('refuses to comment once the merge request has moved past the loaded diff', async () => {
    const calls = stubGitlab({ ...reviewRoutes, [`GET ${API}`]: () => mergeRequest('force-pushed') })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await expect(reviews.addComment({ target: { path: 'a.ts', side: 'additions', line: 2 }, body: 'why?', mode: 'single', headSha: 'head' }))
      .rejects
      .toMatchObject({ name: 'diffOutdated' })
    expect(calls.some(call => call.method === 'POST')).toBe(false)
  })

  it('replies to, resolves and reopens the discussion a root comment belongs to', async () => {
    const calls = stubGitlab({
      ...reviewRoutes,
      [`POST ${API}/discussions/d1/notes`]: () => ({}),
      [`PUT ${API}/discussions/d1`]: () => ({}),
    })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await reviews.reply(5, 'agreed')
    await reviews.resolveThread('d1')
    await reviews.unresolveThread!('d1')

    expect(calls.filter(call => call.method !== 'GET').map(({ method, url, body }) => ({ method, url: url.slice(API.length), body }))).toEqual([
      { method: 'POST', url: '/discussions/d1/notes', body: { body: 'agreed' } },
      { method: 'PUT', url: '/discussions/d1', body: { resolved: true } },
      { method: 'PUT', url: '/discussions/d1', body: { resolved: false } },
    ])
  })

  it('edits and deletes a note by its id', async () => {
    const calls = stubGitlab({ [`PUT ${API}/notes/5`]: () => ({ id: 5 }), [`DELETE ${API}/notes/5`]: () => new Response(null, { status: 204 }) })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await reviews.editComment(5, 'edited')
    await reviews.deleteComment(5)

    expect(calls.map(({ method, body }) => ({ method, body }))).toEqual([{ method: 'PUT', body: { body: 'edited' } }, { method: 'DELETE', body: undefined }])
  })

  it('submits a comment as a note, and an approval as an approval with its summary', async () => {
    const calls = stubGitlab({ [`POST ${API}/notes`]: () => ({ id: 9 }), [`POST ${API}/approve`]: () => ({}), [`POST ${API}/unapprove`]: () => ({}) })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await reviews.submitReview('COMMENT', 'general remark')
    await reviews.submitReview('APPROVE', '')
    await reviews.submitReview('APPROVE', 'lgtm')
    await reviews.revokeApproval!()

    expect(calls.map(({ url, body }) => [url.slice(API.length), body])).toEqual([
      ['/notes', { body: 'general remark' }],
      ['/approve', undefined],
      ['/approve', undefined],
      ['/notes', { body: 'lgtm' }],
      ['/unapprove', undefined],
    ])
  })

  it('leaves no summary behind when GitLab refuses the approval', async () => {
    const calls = stubGitlab({ [`POST ${API}/approve`]: () => new Response(JSON.stringify({ message: '401 Unauthorized' }), { status: 401 }) })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await expect(reviews.submitReview('APPROVE', 'lgtm')).rejects.toMatchObject({ name: 'approvalRefused' })
    expect(calls).toHaveLength(1)
  })

  it('reports a refused write as writeForbidden, naming what the token needs', async () => {
    stubGitlab({ [`POST ${API}/notes`]: () => new Response(JSON.stringify({ error: 'insufficient_scope', error_description: 'The request requires higher privileges than provided by the access token.' }), { status: 403 }) })
    const { reviews } = createGitlabMergeRequestSource(ref, credentials)

    await expect(reviews.submitReview('COMMENT', 'hi')).rejects.toMatchObject({
      name: 'writeForbidden',
      message: expect.stringContaining('higher privileges'),
      fix: expect.stringContaining('"api" scope'),
    })
  })
})
