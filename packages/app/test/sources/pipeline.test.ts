import type { CacheRepositories } from '@pulls.review/core/cache'
import type { Credentials } from '@pulls.review/core/types'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { mount } from '@vue/test-utils'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewThreadCard from '../../src/components/diff/ReviewThreadCard.vue'
import { i18n } from '../../src/i18n'
import { createSourceForRef } from '../../src/sources'
import { createDiffsStore } from '../../src/stores/diffs-store'
import { MERGE_REQUEST_API, MERGE_REQUEST_REF, MERGE_REQUEST_RESPONSES, MERGE_REQUEST_SHAS } from '../fixtures/gitlab/merge-request'

/**
 * One diff, end to end: a host's API responses, through its `DiffSource`, into a
 * `DiffsStore`, out as grouped files and review threads the view renders. Run for
 * GitLab and for GitHub, which must come out of the same pipeline unchanged.
 */

const credentials: Credentials = {
  githubToken: async () => 'github-tok',
  gitlabToken: async host => host === 'gitlab.com' ? 'gitlab-tok' : undefined,
}

interface Call { method: string, url: string, auth: string | null, body?: unknown }

function stubApi(responses: Record<string, unknown>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ method: init.method ?? 'GET', url, auth: new Headers(init.headers).get('Authorization'), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    if (init.method && init.method !== 'GET')
      return new Response('{}')
    if (!(url in responses))
      return new Response(JSON.stringify({ message: '404 Not Found' }), { status: 404 })
    const body = responses[url]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body))
  }))
  return calls
}

/** The store loads threads and shared analyses in the background; a test ends only once those requests have. */
async function settled(calls: Call[]) {
  for (let seen = -1; seen !== calls.length;) {
    seen = calls.length
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

let cache: CacheRepositories

beforeEach(() => {
  cache = createCacheRepositories(createStorage({ driver: memoryDriver() }))
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a GitLab merge request, from API to view', () => {
  const user = { username: 'ada', avatar_url: null, name: 'Ada' }
  const responses = {
    ...MERGE_REQUEST_RESPONSES,
    'https://gitlab.com/api/v4/user': user,
    'https://gitlab.com/api/v4/personal_access_tokens/self': { scopes: ['api'], expires_at: null },
  }

  async function loadStore(calls: Call[]) {
    const store = createDiffsStore(createSourceForRef(MERGE_REQUEST_REF, credentials), { cache })
    await store.load()
    await settled(calls)
    return store
  }

  it('loads the normalized diff under the merge request\'s own cache key', async () => {
    const store = await loadStore(stubApi(responses))

    expect(store.error).toBeUndefined()
    expect(store.diff).toMatchObject({
      ref: MERGE_REQUEST_REF,
      title: 'Retry failed uploads',
      label: '!42',
      author: { name: 'ada' },
      base: { sha: MERGE_REQUEST_SHAS.base_sha, ref: 'main' },
      head: { sha: MERGE_REQUEST_SHAS.head_sha, ref: 'feat/retry-uploads' },
      pullRequest: { state: 'open' },
    })
    expect(store.diff!.commits!.map(commit => commit.message.trim())).toEqual(['feat: retry failed uploads', 'test: cover the retry'])
    expect(store.diff!.files.map(({ path, previousPath, status, additions, deletions, sha }) => ({ path, previousPath, status, additions, deletions, sha }))).toEqual([
      { path: 'src/upload.ts', previousPath: undefined, status: 'modified', additions: 2, deletions: 1, sha: '2'.repeat(40) },
      { path: 'src/upload.test.ts', previousPath: undefined, status: 'added', additions: 2, deletions: 0, sha: '3'.repeat(40) },
      { path: 'docs/README.md', previousPath: 'README.md', status: 'renamed', additions: 1, deletions: 1, sha: '5'.repeat(40) },
    ])
    expect(await cache.diffs.get('gitlab:gitlab.com/acme/platform/web!42')).toBeDefined()
    expect(store.auth).toBe('gitlab-token')
    expect(store.canRefresh).toBe(true)
  })

  it('groups the files with the same rules as any other diff', async () => {
    const store = await loadStore(stubApi(responses))

    const groups = Object.fromEntries(store.groups.map(group => [group.key, group.files.map(file => file.path)]))
    expect(groups).toEqual({
      code: ['src/upload.ts'],
      tests: ['src/upload.test.ts'],
      docs: ['docs/README.md'],
    })
  })

  it('keeps a review mark on a file by its blob sha', async () => {
    const store = await loadStore(stubApi(responses))
    await store.setReviewed(['2'.repeat(40)], true)

    const reopened = await loadStore(stubApi(responses))
    expect(reopened.reviewed).toEqual(new Set(['2'.repeat(40)]))
  })

  it('shows the discussion as a thread on its line, and the approval and note as summaries', async () => {
    const store = await loadStore(stubApi(responses))
    const reviews = store.reviews!

    expect(reviews.supports).toEqual({ pendingReview: false, requestChanges: false })
    expect(reviews.viewerLogin).toBe('ada')
    expect(reviews.canWrite).toBe(true)
    expect(reviews.threads).toMatchObject([{ path: 'src/upload.ts', side: 'additions', line: 2, outdated: false, resolved: false, threadId: 'f00d' }])
    expect(reviews.summaries.map(({ state, author, body }) => [state, author?.login, body])).toEqual([
      ['approved', 'bob', ''],
      ['commented', 'bob', 'Nice and small.'],
    ])

    const card = mount(ReviewThreadCard, { props: { thread: reviews.threads[0]!, reviews }, global: { plugins: [i18n] } })
    // Comment bodies render as Markdown behind a Suspense boundary.
    await vi.waitFor(() => expect(card.text()).toContain('Should this back off between tries?'))
    expect(card.text()).toContain('Good call, next push.')
    card.unmount()
  })

  it('posts a line comment at the GitLab position of the canonical target', async () => {
    const calls = stubApi(responses)
    const store = await loadStore(calls)

    await store.reviews!.addComment({ path: 'docs/README.md', side: 'deletions', line: 1 }, 'Keep the old title?', 'single')
    await settled(calls)

    expect(calls.find(call => call.method === 'POST')).toEqual({
      method: 'POST',
      url: `${MERGE_REQUEST_API}/discussions`,
      auth: 'Bearer gitlab-tok',
      body: {
        body: 'Keep the old title?',
        position: { position_type: 'text', ...MERGE_REQUEST_SHAS, old_path: 'README.md', new_path: 'docs/README.md', old_line: 1 },
      },
    })
  })

  it('sends GitLab only the GitLab token', async () => {
    const calls = stubApi(responses)
    await loadStore(calls)

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(call => call.url.startsWith('https://gitlab.com/') && call.auth === 'Bearer gitlab-tok')).toBe(true)
  })

  it('still shows the diff to an anonymous visitor, without threads', async () => {
    // gitlab.com serves a public merge request's diff to anyone, but its discussions only to a token.
    const { [`${MERGE_REQUEST_API}/discussions?per_page=100&page=1`]: _discussions, ...publicResponses } = MERGE_REQUEST_RESPONSES
    const calls = stubApi(publicResponses)
    const store = createDiffsStore(createSourceForRef(MERGE_REQUEST_REF, { githubToken: async () => undefined }), { cache })
    await store.load()
    await settled(calls)

    expect(store.error).toBeUndefined()
    expect(store.diff!.files).toHaveLength(3)
    expect(store.reviews!.threads).toEqual([])
    expect(store.reviews!.canWrite).toBe(false)
    expect(calls.every(call => call.auth === null)).toBe(true)
  })
})

describe('a GitHub pull request, through the same pipeline', () => {
  const API = 'https://api.github.com/repos/acme/web/pulls/7'
  const responses = {
    [API]: { title: 'Retry failed uploads', body: '', user: { login: 'ada' }, base: { ref: 'main', sha: 'base' }, head: { ref: 'feat', sha: 'head' }, created_at: '', updated_at: '', html_url: 'https://github.com/acme/web/pull/7', state: 'open', draft: false, merged: false },
    [`${API}/files?per_page=100&page=1`]: [
      { filename: 'src/upload.ts', status: 'modified', additions: 1, deletions: 1, sha: 'blob-a', patch: '@@ -1 +1 @@\n-send()\n+retry(send)' },
      { filename: 'docs/README.md', previous_filename: 'README.md', status: 'renamed', additions: 1, deletions: 1, sha: 'blob-b', patch: '@@ -1 +1 @@\n-# Web\n+# Web app' },
    ],
    [`${API}/commits?per_page=100&page=1`]: [{ sha: 'head', commit: { message: 'feat: retry' } }],
    [`${API}/comments?per_page=100&page=1`]: [],
    [`${API}/reviews?per_page=100&page=1`]: [],
    'https://api.github.com/repos/acme/web/issues/7/comments?per_page=100': [],
    'https://api.github.com/user': { login: 'ada', avatar_url: '', name: null },
  }

  it('loads, groups and offers the full GitHub review model', async () => {
    const calls = stubApi(responses)
    const store = createDiffsStore(createSourceForRef({ kind: 'github-pr', owner: 'acme', repo: 'web', number: '7' }, credentials), { cache })
    await store.load()
    await settled(calls)

    expect(store.error).toBeUndefined()
    expect(store.diff).toMatchObject({ ref: { kind: 'github-pr', owner: 'acme', repo: 'web', number: '7' }, label: '#7' })
    expect(store.diff!.files.map(file => [file.path, file.sha])).toEqual([['src/upload.ts', 'blob-a'], ['docs/README.md', 'blob-b']])
    expect(Object.fromEntries(store.groups.map(group => [group.key, group.files.map(file => file.path)]))).toEqual({
      code: ['src/upload.ts'],
      docs: ['docs/README.md'],
    })
    expect(await cache.diffs.get('github:acme/web#7')).toBeDefined()
    expect(store.auth).toBe('github-token')
    expect(store.reviews!.supports).toEqual({ pendingReview: true, requestChanges: true })
    expect(store.reviews!.revokeApproval).toBeUndefined()
    expect(calls.every(call => call.url.startsWith('https://api.github.com/') && call.auth === 'Bearer github-tok')).toBe(true)
  })
})
