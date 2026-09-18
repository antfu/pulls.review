import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubApiError } from './api'
import { addThreadToPendingReview, fetchThreadResolutions, resolveThread } from './review-graphql'

function graphqlResponse(data: unknown, errors?: { type?: string, message: string }[]) {
  return new Response(JSON.stringify({ data, errors }), { status: 200 })
}

function threadsPage(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return {
    repository: {
      pullRequest: {
        reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes },
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchThreadResolutions', () => {
  it('maps threads by their root comment id across pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphqlResponse(threadsPage([
        { id: 'T_1', isResolved: true, comments: { nodes: [{ fullDatabaseId: '101' }] } },
      ], true, 'cursor-1')))
      .mockResolvedValueOnce(graphqlResponse(threadsPage([
        { id: 'T_2', isResolved: false, comments: { nodes: [{ fullDatabaseId: '202' }] } },
      ])))
    vi.stubGlobal('fetch', fetchMock)

    const resolutions = await fetchThreadResolutions('owner', 'repo', '5', 'token')

    expect(resolutions.get(101)).toEqual({ threadId: 'T_1', isResolved: true })
    expect(resolutions.get(202)).toEqual({ threadId: 'T_2', isResolved: false })
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1].body)
    expect(secondBody.variables).toMatchObject({ owner: 'owner', repo: 'repo', number: 5, cursor: 'cursor-1' })
  })

  it('maps a FORBIDDEN GraphQL error to a 403 GithubApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse(null, [{ type: 'FORBIDDEN', message: 'nope' }])))

    const failure = await fetchThreadResolutions('owner', 'repo', '5', 'token').catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(GithubApiError)
    expect((failure as GithubApiError).status).toBe(403)
  })
})

describe('mutations', () => {
  it('resolves a thread by node id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse({ resolveReviewThread: { thread: { id: 'T_1', isResolved: true } } }))
    vi.stubGlobal('fetch', fetchMock)

    await resolveThread('T_1', 'token')

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.query).toContain('resolveReviewThread')
    expect(body.variables).toEqual({ threadId: 'T_1' })
  })

  it('adds a draft thread to the pending review with GitHub-side names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse({ addPullRequestReviewThread: { thread: { id: 'T_9' } } }))
    vi.stubGlobal('fetch', fetchMock)

    await addThreadToPendingReview('PRR_1', { path: 'src/a.ts', side: 'deletions', line: 9, startLine: 7, startSide: 'additions' }, 'my draft', 'token')

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.variables).toEqual({
      reviewId: 'PRR_1',
      path: 'src/a.ts',
      body: 'my draft',
      line: 9,
      side: 'LEFT',
      startLine: 7,
      startSide: 'RIGHT',
    })
  })
})
