import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenPullRequests } from './pull-request-list'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const restItem = {
  number: 42,
  title: 'feat: add thing',
  html_url: 'https://github.com/o/r/pull/42',
  draft: true,
  user: { login: 'alice', avatar_url: 'https://avatars/alice' },
  labels: [{ name: 'bug', color: 'd73a4a', description: null }],
  assignees: [{ login: 'bob', avatar_url: 'https://avatars/bob' }],
  milestone: { title: 'v1.0' },
  comments: 3,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
}

describe('fetchOpenPullRequests without a token (REST search)', () => {
  it('queries open PRs of the repo sorted by recent activity and normalizes rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ total_count: 1, items: [restItem] }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchOpenPullRequests('o', 'r', undefined)

    const url = new URL(fetchMock.mock.calls[0]![0])
    expect(url.pathname).toBe('/search/issues')
    expect(url.searchParams.get('q')).toBe('repo:o/r is:pr is:open')
    expect(url.searchParams.get('sort')).toBe('updated')
    expect(url.searchParams.get('page')).toBe('1')
    expect(page).toEqual({
      totalCount: 1,
      next: undefined,
      items: [{
        number: 42,
        title: 'feat: add thing',
        url: 'https://github.com/o/r/pull/42',
        state: 'draft',
        author: { login: 'alice', avatarUrl: 'https://avatars/alice' },
        labels: [{ name: 'bug', color: 'd73a4a', description: undefined }],
        assignees: [{ login: 'bob', avatarUrl: 'https://avatars/bob' }],
        milestone: 'v1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        comments: 3,
      }],
    })
  })

  it('continues with the next page number while a full page came back and more exist', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ ...restItem, number: i + 1, draft: false, user: null, assignees: null, milestone: null }))
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ total_count: 250, items }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchOpenPullRequests('o', 'r', undefined)
    expect(first.next).toBe('2')
    expect(first.items[0]).toMatchObject({ state: 'open', author: undefined, assignees: [], milestone: undefined })

    const third = await fetchOpenPullRequests('o', 'r', undefined, '3')
    expect(new URL(fetchMock.mock.calls[1]![0]).searchParams.get('page')).toBe('3')
    expect(third.next).toBeUndefined()
  })

  it('stops at the search API result cap even when the total is larger', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ ...restItem, number: i }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ total_count: 5000, items })))

    const page = await fetchOpenPullRequests('o', 'r', undefined, '10')
    expect(page.next).toBeUndefined()
  })
})

describe('fetchOpenPullRequests with a token (GraphQL search)', () => {
  const node = {
    number: 7,
    title: 'fix: crash',
    url: 'https://github.com/o/r/pull/7',
    isDraft: false,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-03-02T00:00:00Z',
    author: { login: 'carol', avatarUrl: 'https://avatars/carol' },
    labels: { nodes: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature' }] },
    assignees: { nodes: [] },
    milestone: null,
    comments: { totalCount: 5 },
    reviewDecision: 'CHANGES_REQUESTED',
    closingIssuesReferences: { totalCount: 2 },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
  }

  it('posts the search query with the token and maps review, checks and linked issues', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { search: { issueCount: 12, pageInfo: { hasNextPage: true, endCursor: 'Y3Vyc29y' }, nodes: [node, {}] } },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchOpenPullRequests('o', 'r', 'tok')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/graphql')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body).variables).toEqual({ query: 'repo:o/r is:pr is:open sort:updated-desc', first: 100, cursor: null })

    expect(page.totalCount).toBe(12)
    expect(page.next).toBe('Y3Vyc29y')
    expect(page.items).toEqual([{
      number: 7,
      title: 'fix: crash',
      url: 'https://github.com/o/r/pull/7',
      state: 'open',
      author: { login: 'carol', avatarUrl: 'https://avatars/carol' },
      labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature' }],
      assignees: [],
      milestone: undefined,
      createdAt: '2025-03-01T00:00:00Z',
      updatedAt: '2025-03-02T00:00:00Z',
      comments: 5,
      reviewDecision: 'changes_requested',
      checks: 'failure',
      linkedIssues: 2,
    }])
  })

  it('passes the cursor along and leaves optional fields unset when GitHub has nothing', async () => {
    const bare = { ...node, reviewDecision: null, closingIssuesReferences: null, commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { search: { issueCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [bare] } },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchOpenPullRequests('o', 'r', 'tok', 'abc')

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables.cursor).toBe('abc')
    expect(page.next).toBeUndefined()
    expect(page.items[0]).toMatchObject({ reviewDecision: undefined, checks: undefined, linkedIssues: 0 })
  })
})
