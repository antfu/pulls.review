import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubApiError } from './api'
import {
  createPendingReview,
  createReview,
  createReviewComment,
  deletePendingReview,
  deleteReviewComment,
  fetchReviewComments,
  replyToReviewComment,
  submitPendingReview,
  updateReviewComment,
} from './review-api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchReviewComments', () => {
  it('paginates until a short page', async () => {
    const pageOne = Array.from({ length: 100 }, (_, i) => ({ id: i }))
    const pageTwo = [{ id: 100 }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(pageOne))
      .mockResolvedValueOnce(jsonResponse(pageTwo))
    vi.stubGlobal('fetch', fetchMock)

    const comments = await fetchReviewComments('owner', 'repo', '1', 'token')

    expect(comments).toHaveLength(101)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/owner/repo/pulls/1/comments?per_page=100&page=1')
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.github.com/repos/owner/repo/pulls/1/comments?per_page=100&page=2')
  })

  it('surfaces GitHub\'s own error message with the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Resource not accessible by personal access token' }, 403)))

    const failure = await fetchReviewComments('owner', 'repo', '1', 'token').catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(GithubApiError)
    expect((failure as GithubApiError).status).toBe(403)
    expect((failure as GithubApiError).message).toBe('Resource not accessible by personal access token')
  })
})

describe('write endpoints', () => {
  const input = {
    body: 'Nice catch',
    commitId: 'head-sha',
    path: 'src/a.ts',
    side: 'RIGHT' as const,
    line: 5,
    startLine: 3,
    startSide: 'RIGHT' as const,
  }

  it('posts a standalone comment with the anchor fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201))
    vi.stubGlobal('fetch', fetchMock)

    await createReviewComment('owner', 'repo', '1', input, 'token')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/owner/repo/pulls/1/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      body: 'Nice catch',
      commit_id: 'head-sha',
      path: 'src/a.ts',
      side: 'RIGHT',
      line: 5,
      start_line: 3,
      start_side: 'RIGHT',
    })
  })

  it('starts a pending review by creating a review with the comment and no event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await createPendingReview('owner', 'repo', '1', input, 'token')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/owner/repo/pulls/1/reviews')
    const body = JSON.parse(init.body)
    expect(body.event).toBeUndefined()
    expect(body.comments).toEqual([{
      path: 'src/a.ts',
      body: 'Nice catch',
      side: 'RIGHT',
      line: 5,
      start_line: 3,
      start_side: 'RIGHT',
    }])
  })

  it('submits a pending review through the events endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await submitPendingReview('owner', 'repo', '1', 42, 'APPROVE', 'LGTM', 'token')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/owner/repo/pulls/1/reviews/42/events')
    expect(JSON.parse(init.body)).toEqual({ event: 'APPROVE', body: 'LGTM' })
  })

  it('submits a review directly when nothing is pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await createReview('owner', 'repo', '1', 'REQUEST_CHANGES', 'Please fix', 'token')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/owner/repo/pulls/1/reviews')
    expect(JSON.parse(init.body)).toEqual({ event: 'REQUEST_CHANGES', body: 'Please fix' })
  })

  it('replies, edits and deletes against the comment endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await replyToReviewComment('owner', 'repo', '1', 7, 'Agreed', 'token')
    await updateReviewComment('owner', 'repo', 8, 'Edited', 'token')
    await deleteReviewComment('owner', 'repo', 8, 'token')
    await deletePendingReview('owner', 'repo', '1', 42, 'token')

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ['POST', 'https://api.github.com/repos/owner/repo/pulls/1/comments/7/replies'],
      ['PATCH', 'https://api.github.com/repos/owner/repo/pulls/comments/8'],
      ['DELETE', 'https://api.github.com/repos/owner/repo/pulls/comments/8'],
      ['DELETE', 'https://api.github.com/repos/owner/repo/pulls/1/reviews/42'],
    ])
  })
})
