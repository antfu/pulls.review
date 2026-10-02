import type { MockedFunction } from 'vitest'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheStorage } from '../cache/storage'
import { createGithubWriteAccess } from './github-write-access'
import { createReviewsStore } from './reviews-store'

interface Route {
  match: (url: string, init?: RequestInit) => boolean
  respond: (init?: RequestInit) => Response
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers })
}

function userRoute(scopes: string | undefined): Route {
  return {
    match: url => url.endsWith('/user'),
    respond: () => jsonResponse(
      { login: 'octocat', avatar_url: 'https://github.com/octocat.png', name: null },
      scopes === undefined ? {} : { 'x-oauth-scopes': scopes },
    ),
  }
}

const emptyReviewRoutes: Route[] = [
  { match: url => url.includes('/pulls/1/comments'), respond: () => jsonResponse([]) },
  { match: url => url.includes('/pulls/1/reviews'), respond: () => jsonResponse([]) },
  { match: url => url.endsWith('/graphql'), respond: () => jsonResponse({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } } }) },
]

function stubFetch(routes: Route[]): MockedFunction<typeof fetch> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const route = routes.find(candidate => candidate.match(url, init))
    if (!route)
      throw new Error(`Unexpected fetch: ${url}`)
    return route.respond(init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock as MockedFunction<typeof fetch>
}

function makeStore(token?: string) {
  return createReviewsStore({ owner: 'owner', repo: 'repo', number: '1' }, {
    storage: createCacheStorage(memoryDriver()),
    token,
    access: createGithubWriteAccess(token),
    getHeadSha: () => 'head-sha',
    getCacheKey: () => undefined,
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('write gating', () => {
  it('stays read-only without a token and never hits /user', async () => {
    const fetchMock = stubFetch(emptyReviewRoutes)
    const store = makeStore()

    await store.load()

    expect(store.canWrite).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/user'))).toBe(false)
  })

  it('enables writes for a classic token with the repo scope', async () => {
    stubFetch([userRoute('repo, read:org'), ...emptyReviewRoutes])
    const store = makeStore('classic-token')

    await store.load()

    expect(store.canWrite).toBe(true)
    expect(store.viewerLogin).toBe('octocat')
  })

  it('keeps writes off for a classic token without a repo scope', async () => {
    stubFetch([userRoute('gist, read:org'), ...emptyReviewRoutes])
    const store = makeStore('classic-token')

    await store.load()

    expect(store.canWrite).toBe(false)
  })

  it('is optimistic for a fine-grained token (no scopes header)', async () => {
    stubFetch([userRoute(undefined), ...emptyReviewRoutes])
    const store = makeStore('fine-grained-token')

    await store.load()

    expect(store.canWrite).toBe(true)
  })

  it('flips the session read-only when a write gets a 403', async () => {
    stubFetch([
      userRoute(undefined),
      {
        match: (url, init) => url.includes('/pulls/1/comments') && init?.method === 'POST',
        respond: () => new Response(JSON.stringify({ message: 'Resource not accessible' }), { status: 403 }),
      },
      ...emptyReviewRoutes,
    ])
    const store = makeStore('fine-grained-token')
    await store.load()
    expect(store.canWrite).toBe(true)

    await expect(
      store.addComment({ path: 'src/a.ts', side: 'additions', line: 2 }, 'hi', 'single'),
    ).rejects.toThrow('Resource not accessible')

    expect(store.canWrite).toBe(false)
    expect(store.writeBlockedReason).toContain('Pull requests: Read and write')
  })
})

describe('loading', () => {
  it('populates threads and summaries from GitHub, merging pending draft comments', async () => {
    stubFetch([
      userRoute('repo'),
      {
        match: url => url.includes('/pulls/1/reviews/9/comments'),
        respond: () => jsonResponse([
          { id: 50, pull_request_review_id: 9, path: 'src/a.ts', side: 'RIGHT', line: 3, start_line: null, start_side: null, user: { login: 'octocat', avatar_url: '' }, body: 'draft', created_at: '2026-01-01T00:00:00Z', html_url: '' },
        ]),
      },
      {
        match: url => url.includes('/pulls/1/reviews'),
        respond: () => jsonResponse([
          { id: 8, node_id: 'PRR_8', user: { login: 'antfu', avatar_url: '' }, state: 'APPROVED', body: 'ship it', submitted_at: '2026-01-01T00:00:00Z', html_url: '' },
          { id: 9, node_id: 'PRR_9', user: { login: 'octocat', avatar_url: '' }, state: 'PENDING', body: null, html_url: '' },
        ]),
      },
      {
        match: url => url.includes('/pulls/1/comments'),
        respond: () => jsonResponse([
          { id: 1, pull_request_review_id: 8, path: 'src/a.ts', side: 'RIGHT', line: 2, start_line: null, start_side: null, user: { login: 'antfu', avatar_url: '' }, body: 'question', created_at: '2026-01-01T00:00:00Z', html_url: '' },
        ]),
      },
      {
        match: url => url.endsWith('/graphql'),
        respond: () => jsonResponse({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'T_1', isResolved: false, comments: { nodes: [{ fullDatabaseId: '1' }] } }] } } } } }),
      },
    ])
    const store = makeStore('classic-token')

    await store.load()

    expect(store.threads).toHaveLength(2)
    expect(store.threads.find(thread => thread.rootId === 1)).toMatchObject({ threadId: 'T_1', resolved: false })
    expect(store.pendingReview).toEqual({ id: 9, nodeId: 'PRR_9', body: '' })
    expect(store.pendingCommentCount).toBe(1)
    expect(store.summaries).toEqual([expect.objectContaining({ id: 8, state: 'approved' })])
  })
})

describe('addComment endpoint selection', () => {
  it('starts a pending review via REST when none exists', async () => {
    const posts: string[] = []
    stubFetch([
      userRoute('repo'),
      {
        match: (url, init) => init?.method === 'POST' && url.includes('/pulls/1/reviews'),
        respond: (init) => {
          posts.push(String(JSON.parse(init!.body as string).comments?.length))
          return jsonResponse({})
        },
      },
      ...emptyReviewRoutes,
    ])
    const store = makeStore('classic-token')
    await store.load()

    await store.addComment({ path: 'src/a.ts', side: 'additions', line: 2 }, 'first draft', 'review')

    expect(posts).toEqual(['1'])
  })

  it('adds to an existing pending review via GraphQL', async () => {
    const graphqlBodies: { query: string }[] = []
    stubFetch([
      userRoute('repo'),
      {
        match: url => url.includes('/pulls/1/reviews/9/comments'),
        respond: () => jsonResponse([]),
      },
      {
        match: url => url.includes('/pulls/1/reviews'),
        respond: () => jsonResponse([
          { id: 9, node_id: 'PRR_9', user: { login: 'octocat', avatar_url: '' }, state: 'PENDING', body: null, html_url: '' },
        ]),
      },
      {
        match: url => url.includes('/pulls/1/comments'),
        respond: () => jsonResponse([]),
      },
      {
        match: (url, init) => url.endsWith('/graphql') && String(init?.body).includes('addPullRequestReviewThread'),
        respond: (init) => {
          graphqlBodies.push(JSON.parse(init!.body as string))
          return jsonResponse({ data: { addPullRequestReviewThread: { thread: { id: 'T_9' } } } })
        },
      },
      {
        match: url => url.endsWith('/graphql'),
        respond: () => jsonResponse({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } } }),
      },
    ])
    const store = makeStore('classic-token')
    await store.load()
    expect(store.pendingReview).toBeDefined()

    await store.addComment({ path: 'src/a.ts', side: 'additions', line: 2 }, 'another draft', 'review')

    expect(graphqlBodies).toHaveLength(1)
  })
})
