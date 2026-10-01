import type { GithubReviewCommentJson, GithubReviewJson } from './review-api'
import { describe, expect, it } from 'vitest'
import { normalizeReviewData } from './review-normalize'

function comment(overrides: Partial<GithubReviewCommentJson> = {}): GithubReviewCommentJson {
  return {
    id: 1,
    pull_request_review_id: 10,
    path: 'src/a.ts',
    side: 'RIGHT',
    line: 5,
    start_line: null,
    start_side: null,
    user: { login: 'antfu', avatar_url: 'https://github.com/antfu.png' },
    body: 'hello',
    created_at: '2026-09-01T10:00:00Z',
    html_url: 'https://github.com/x',
    ...overrides,
  }
}

function review(overrides: Partial<GithubReviewJson> = {}): GithubReviewJson {
  return {
    id: 10,
    node_id: 'PRR_10',
    user: { login: 'antfu', avatar_url: 'https://github.com/antfu.png' },
    state: 'APPROVED',
    body: 'LGTM',
    submitted_at: '2026-09-01T12:00:00Z',
    html_url: 'https://github.com/r',
    ...overrides,
  }
}

describe('normalizeReviewData', () => {
  it('threads replies under their root comment', () => {
    const data = normalizeReviewData({
      comments: [
        comment({ id: 1 }),
        comment({ id: 2, in_reply_to_id: 1, body: 'reply' }),
        comment({ id: 3, line: 9 }),
      ],
      reviews: [],
      pendingComments: [],
    })

    expect(data.threads).toHaveLength(2)
    const [first, second] = data.threads
    expect(first!.rootId).toBe(1)
    expect(first!.comments.map(c => c.body)).toEqual(['hello', 'reply'])
    expect(second!.rootId).toBe(3)
  })

  it('marks a null-line thread as outdated with no anchor', () => {
    const data = normalizeReviewData({
      comments: [comment({ line: null })],
      reviews: [],
      pendingComments: [],
    })

    expect(data.threads[0]!.outdated).toBe(true)
    expect(data.threads[0]!.line).toBeUndefined()
  })

  it('maps sides and multi-line anchors to the canonical vocabulary', () => {
    const data = normalizeReviewData({
      comments: [comment({ side: 'LEFT', start_line: 3, start_side: 'RIGHT' })],
      reviews: [],
      pendingComments: [],
    })

    expect(data.threads[0]).toMatchObject({ side: 'deletions', startLine: 3, startSide: 'additions' })
  })

  it('flags pending draft comments and their threads', () => {
    const data = normalizeReviewData({
      comments: [comment({ id: 1 })],
      reviews: [],
      pendingComments: [comment({ id: 5, line: 8 })],
    })

    const pendingThread = data.threads.find(thread => thread.rootId === 5)!
    expect(pendingThread.pending).toBe(true)
    expect(pendingThread.comments[0]!.pending).toBe(true)
    expect(data.threads.find(thread => thread.rootId === 1)!.pending).toBe(false)
  })

  it('merges GraphQL resolution info by root comment id', () => {
    const data = normalizeReviewData({
      comments: [comment({ id: 1 })],
      reviews: [],
      pendingComments: [],
      resolutions: new Map([[1, { threadId: 'T_1', isResolved: true }]]),
    })

    expect(data.threads[0]).toMatchObject({ resolved: true, threadId: 'T_1' })
  })

  it('leaves resolution undefined without GraphQL data', () => {
    const data = normalizeReviewData({ comments: [comment()], reviews: [], pendingComments: [] })

    expect(data.threads[0]!.resolved).toBeUndefined()
    expect(data.threads[0]!.threadId).toBeUndefined()
  })

  it('splits reviews into summaries and the viewer pending review, dropping empty comment wrappers', () => {
    const data = normalizeReviewData({
      comments: [],
      reviews: [
        review({ id: 1, state: 'APPROVED' }),
        review({ id: 2, state: 'CHANGES_REQUESTED', body: 'fix this' }),
        review({ id: 3, state: 'COMMENTED', body: null }),
        review({ id: 4, state: 'COMMENTED', body: 'a real remark' }),
        review({ id: 5, state: 'PENDING', node_id: 'PRR_5', body: null }),
      ],
      pendingComments: [],
    })

    expect(data.summaries.map(summary => [summary.id, summary.state])).toEqual([
      [1, 'approved'],
      [2, 'changes_requested'],
      [4, 'commented'],
    ])
    expect(data.pendingReview).toEqual({ id: 5, nodeId: 'PRR_5', body: '' })
  })

  it('handles ghost (deleted) authors', () => {
    const data = normalizeReviewData({
      comments: [comment({ user: null })],
      reviews: [review({ user: null })],
      pendingComments: [],
    })

    expect(data.threads[0]!.comments[0]!.author).toBeUndefined()
    expect(data.summaries[0]!.author).toBeUndefined()
  })
})
