import type { CommentAuthor, CommentThread, PendingReview, ReviewSummary } from '../../app/types/comment-threads'

/** Shared mock review fixtures for Storybook stories. */

export const octocat: CommentAuthor = { login: 'octocat', avatarUrl: 'https://github.com/octocat.png' }
export const reviewer: CommentAuthor = { login: 'antfu', avatarUrl: 'https://github.com/antfu.png' }

export function mockThread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    rootId: 1,
    path: 'src/a.ts',
    side: 'additions',
    line: 2,
    outdated: false,
    pending: false,
    comments: [{
      id: 1,
      author: reviewer,
      body: 'Should this handle the `undefined` case as well?',
      createdAt: '2026-09-01T10:00:00Z',
      pending: false,
    }],
    ...overrides,
  }
}

export function mockMultiReplyThread(): CommentThread {
  return mockThread({
    rootId: 10,
    comments: [
      { id: 10, author: reviewer, body: 'This loop looks O(n²) - can we use a `Map` here?', createdAt: '2026-09-01T10:00:00Z', pending: false },
      { id: 11, author: octocat, body: 'Good catch, switched to a `Map` in the latest commit.', createdAt: '2026-09-01T11:30:00Z', pending: false },
      { id: 12, author: reviewer, body: 'Thanks! LGTM now.', createdAt: '2026-09-01T12:00:00Z', pending: false },
    ],
  })
}

export function mockPendingThread(): CommentThread {
  return mockThread({
    rootId: 20,
    line: 3,
    pending: true,
    comments: [{
      id: 20,
      author: octocat,
      body: 'Draft note to self: double-check this before approving.',
      createdAt: '2026-09-02T09:00:00Z',
      pending: true,
    }],
  })
}

export const mockPendingReview: PendingReview = { id: 99, nodeId: 'PRR_mock', body: '' }

export const mockSummaries: ReviewSummary[] = [
  { id: 1, author: reviewer, state: 'changes_requested', body: 'A few perf concerns inline.', submittedAt: '2026-09-01T10:05:00Z' },
  { id: 2, author: octocat, state: 'commented', body: 'Addressed everything, PTAL!', submittedAt: '2026-09-01T14:00:00Z' },
  { id: 3, author: reviewer, state: 'approved', body: '', submittedAt: '2026-09-02T08:00:00Z' },
]
