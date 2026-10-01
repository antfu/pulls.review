import type { CommentAuthor, CommentThread, DiffSide, ReviewData, ReviewSummary, ReviewSummaryState } from '../../types/comment-threads'
import type { GithubReviewCommentJson, GithubReviewJson, GithubUserJson } from './review-api'
import type { ThreadResolutionInfo } from './review-graphql'

function normalizeSide(side: 'LEFT' | 'RIGHT' | null): DiffSide {
  return side === 'LEFT' ? 'deletions' : 'additions'
}

function normalizeAuthor(user: GithubUserJson | null): CommentAuthor | undefined {
  return user ? { login: user.login, avatarUrl: user.avatar_url } : undefined
}

const SUMMARY_STATE_MAP: Record<string, ReviewSummaryState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
}

/**
 * Folds the three raw GitHub responses (submitted comments, reviews, the
 * viewer's pending draft comments) plus the optional GraphQL resolution map
 * into the canonical `ReviewData`: comments threaded under their root by
 * `in_reply_to_id`, threads anchored by side+line, reviews split into
 * submitted summaries vs the viewer's pending review.
 */
export function normalizeReviewData(input: {
  comments: GithubReviewCommentJson[]
  reviews: GithubReviewJson[]
  pendingComments: GithubReviewCommentJson[]
  resolutions?: Map<number, ThreadResolutionInfo>
}): ReviewData {
  const threads = new Map<number, CommentThread>()

  function addComment(comment: GithubReviewCommentJson, pending: boolean) {
    const rootId = comment.in_reply_to_id ?? comment.id
    let thread = threads.get(rootId)
    if (!thread) {
      const resolution = input.resolutions?.get(rootId)
      thread = {
        rootId,
        path: comment.path,
        side: normalizeSide(comment.side),
        line: comment.line ?? undefined,
        startLine: comment.start_line ?? undefined,
        startSide: comment.start_side ? normalizeSide(comment.start_side) : undefined,
        outdated: comment.line == null,
        resolved: resolution?.isResolved,
        threadId: resolution?.threadId,
        pending,
        comments: [],
      }
      threads.set(rootId, thread)
    }
    thread.comments.push({
      id: comment.id,
      author: normalizeAuthor(comment.user),
      body: comment.body,
      createdAt: comment.created_at,
      url: comment.html_url,
      pending,
    })
  }

  // Submitted comments arrive sorted ascending by id, so roots always precede
  // their replies; pending drafts can only be roots (replies post immediately).
  for (const comment of input.comments)
    addComment(comment, false)
  for (const comment of input.pendingComments)
    addComment(comment, true)

  const summaries: ReviewSummary[] = []
  let pendingReview: ReviewData['pendingReview']
  for (const review of input.reviews) {
    if (review.state === 'PENDING') {
      // GitHub only ever returns the requesting user's own pending review.
      pendingReview = { id: review.id, nodeId: review.node_id, body: review.body ?? '' }
      continue
    }
    // A bare COMMENTED review with no body is the implicit wrapper GitHub
    // creates around standalone inline comments - noise, not a verdict.
    if (review.state === 'COMMENTED' && !review.body)
      continue
    const state = SUMMARY_STATE_MAP[review.state]
    if (!state)
      continue
    summaries.push({
      id: review.id,
      author: normalizeAuthor(review.user),
      state,
      body: review.body ?? '',
      submittedAt: review.submitted_at,
      url: review.html_url,
    })
  }

  return {
    threads: [...threads.values()],
    summaries,
    pendingReview,
  }
}
