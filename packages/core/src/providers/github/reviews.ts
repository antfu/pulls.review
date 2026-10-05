import type { DiffSide } from '../../types/comment-threads'
import type { ReviewsApi } from '../../types/source'
import type { GithubClient } from './client'
import type { PullRequestRef } from './shared-analysis-comment'
import { createPendingReview, createReview, createReviewComment, deletePendingReview, deleteReviewComment, fetchReviewComments, fetchReviewCommentsForReview, fetchReviews, replyToReviewComment, submitPendingReview, updateReviewComment } from './review-api'
import { addThreadToPendingReview, fetchThreadResolutions, resolveThread } from './review-graphql'
import { normalizeReviewData } from './review-normalize'
import { asWrite } from './writes'

function toGithubSide(side: DiffSide): 'LEFT' | 'RIGHT' {
  return side === 'additions' ? 'RIGHT' : 'LEFT'
}

export function createGithubReviewsApi(client: GithubClient, { owner, repo, number }: PullRequestRef): ReviewsApi {
  return {
    async fetch() {
      const [comments, reviews] = await Promise.all([
        fetchReviewComments(client, owner, repo, number),
        fetchReviews(client, owner, repo, number),
      ])
      const pending = reviews.find(review => review.state === 'PENDING')
      const [pendingComments, resolutions] = await Promise.all([
        pending ? fetchReviewCommentsForReview(client, owner, repo, number, pending.id) : Promise.resolve([]),
        // Resolution lives in GraphQL only, which needs a token - degrade to
        // "resolution unknown" silently for anonymous viewers or on failure.
        await client.token() ? fetchThreadResolutions(client, owner, repo, number).catch(() => undefined) : Promise.resolve(undefined),
      ])
      return normalizeReviewData({ comments, reviews, pendingComments, resolutions })
    },
    addComment: ({ target, body, mode, headSha, pendingReview }) => asWrite(async () => {
      if (mode === 'review' && pendingReview)
        return addThreadToPendingReview(client, pendingReview.nodeId, target, body)
      const input = {
        body,
        commitId: headSha,
        path: target.path,
        side: toGithubSide(target.side),
        line: target.line,
        startLine: target.startLine,
        startSide: target.startSide ? toGithubSide(target.startSide) : undefined,
      }
      return mode === 'review'
        ? createPendingReview(client, owner, repo, number, input)
        : createReviewComment(client, owner, repo, number, input)
    }),
    reply: (rootCommentId, body) => asWrite(() => replyToReviewComment(client, owner, repo, number, rootCommentId, body)),
    editComment: (commentId, body) => asWrite(() => updateReviewComment(client, owner, repo, commentId, body)),
    deleteComment: commentId => asWrite(() => deleteReviewComment(client, owner, repo, commentId)),
    resolveThread: threadId => asWrite(() => resolveThread(client, threadId)),
    submitReview: (verdict, body, pendingReview) => asWrite(() => pendingReview
      ? submitPendingReview(client, owner, repo, number, pendingReview.id, verdict, body)
      : createReview(client, owner, repo, number, verdict, body)),
    discardPendingReview: pendingReview => asWrite(() => deletePendingReview(client, owner, repo, number, pendingReview.id)),
  }
}
