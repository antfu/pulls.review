import type { ReviewVerdict } from '../../types/comment-threads'
import type { GithubClient } from './client'

export interface GithubUserJson {
  login: string
  avatar_url: string
}

export interface GithubReviewCommentJson {
  id: number
  in_reply_to_id?: number
  pull_request_review_id: number | null
  path: string
  side: 'LEFT' | 'RIGHT'
  /** Anchor line in the current diff; `null`/absent when the comment is outdated. */
  line: number | null
  start_line: number | null
  start_side: 'LEFT' | 'RIGHT' | null
  user: GithubUserJson | null
  body: string
  created_at: string
  html_url: string
}

export interface GithubReviewJson {
  id: number
  node_id: string
  user: GithubUserJson | null
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  body: string | null
  submitted_at?: string
  html_url: string
}

export async function fetchReviewComments(client: GithubClient, owner: string, repo: string, number: string): Promise<GithubReviewCommentJson[]> {
  return client.paginate(`/repos/${owner}/${repo}/pulls/${number}/comments`)
}

export async function fetchReviews(client: GithubClient, owner: string, repo: string, number: string): Promise<GithubReviewJson[]> {
  return client.paginate(`/repos/${owner}/${repo}/pulls/${number}/reviews`)
}

/** Comments belonging to one review - used to load the viewer's pending draft comments. */
export async function fetchReviewCommentsForReview(client: GithubClient, owner: string, repo: string, number: string, reviewId: number): Promise<GithubReviewCommentJson[]> {
  return client.paginate(`/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/comments`)
}

export interface NewReviewCommentInput {
  body: string
  commitId: string
  path: string
  side: 'LEFT' | 'RIGHT'
  line: number
  startLine?: number
  startSide?: 'LEFT' | 'RIGHT'
}

/** Posts an immediate, standalone review comment (GitHub's "Add single comment"). */
export async function createReviewComment(client: GithubClient, owner: string, repo: string, number: string, input: NewReviewCommentInput): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/comments`, { method: 'POST', body: {
    body: input.body,
    commit_id: input.commitId,
    path: input.path,
    side: input.side,
    line: input.line,
    start_line: input.startLine,
    start_side: input.startSide,
  } })
}

/** Starts a pending review holding the first draft comment (no `event` = stays PENDING). */
export async function createPendingReview(client: GithubClient, owner: string, repo: string, number: string, input: NewReviewCommentInput): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: {
    commit_id: input.commitId,
    comments: [{
      path: input.path,
      body: input.body,
      side: input.side,
      line: input.line,
      start_line: input.startLine,
      start_side: input.startSide,
    }],
  } })
}

export async function replyToReviewComment(client: GithubClient, owner: string, repo: string, number: string, rootCommentId: number, body: string): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/comments/${rootCommentId}/replies`, { method: 'POST', body: { body } })
}

export async function updateReviewComment(client: GithubClient, owner: string, repo: string, commentId: number, body: string): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, { method: 'PATCH', body: { body } })
}

export async function deleteReviewComment(client: GithubClient, owner: string, repo: string, commentId: number): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, { method: 'DELETE' })
}

/** Submits the viewer's pending review with a verdict. */
export async function submitPendingReview(client: GithubClient, owner: string, repo: string, number: string, reviewId: number, event: ReviewVerdict, body: string): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/events`, { method: 'POST', body: { event, body } })
}

/** Submits a review with no draft comments (e.g. a straight Approve) in one shot. */
export async function createReview(client: GithubClient, owner: string, repo: string, number: string, event: ReviewVerdict, body: string): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: { event, body } })
}

/** Deletes the viewer's pending review, discarding its draft comments. */
export async function deletePendingReview(client: GithubClient, owner: string, repo: string, number: string, reviewId: number): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`, { method: 'DELETE' })
}
