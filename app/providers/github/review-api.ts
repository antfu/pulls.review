import type { ReviewVerdict } from '../../types/comment-threads'
import { buildHeaders, GithubApiError } from './api'

const GITHUB_API_BASE = 'https://api.github.com'

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

/**
 * Shared request path for both reads and writes: parses GitHub's own `message`
 * out of error bodies (e.g. "Resource not accessible by personal access token")
 * so a permission failure surfaces as something actionable, not a bare status.
 */
async function githubRequest(method: string, url: string, token: string | undefined, body?: object): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message: string | undefined
    try {
      message = (await res.json() as { message?: string }).message
    }
    catch {}
    throw new GithubApiError(res.status, message ?? `GitHub API request failed (${res.status}): ${url}`)
  }
  return res
}

async function fetchAllPages<T>(baseUrl: string, token: string | undefined): Promise<T[]> {
  const items: T[] = []
  let page = 1
  for (;;) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    const res = await githubRequest('GET', `${baseUrl}${separator}per_page=100&page=${page}`, token)
    const pageItems: T[] = await res.json()
    items.push(...pageItems)
    if (pageItems.length < 100)
      break
    page++
  }
  return items
}

export async function fetchReviewComments(owner: string, repo: string, number: string, token?: string): Promise<GithubReviewCommentJson[]> {
  return fetchAllPages(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/comments`, token)
}

export async function fetchReviews(owner: string, repo: string, number: string, token?: string): Promise<GithubReviewJson[]> {
  return fetchAllPages(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews`, token)
}

/** Comments belonging to one review - used to load the viewer's pending draft comments. */
export async function fetchReviewCommentsForReview(owner: string, repo: string, number: string, reviewId: number, token?: string): Promise<GithubReviewCommentJson[]> {
  return fetchAllPages(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/comments`, token)
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
export async function createReviewComment(owner: string, repo: string, number: string, input: NewReviewCommentInput, token: string): Promise<void> {
  await githubRequest('POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/comments`, token, {
    body: input.body,
    commit_id: input.commitId,
    path: input.path,
    side: input.side,
    line: input.line,
    start_line: input.startLine,
    start_side: input.startSide,
  })
}

/** Starts a pending review holding the first draft comment (no `event` = stays PENDING). */
export async function createPendingReview(owner: string, repo: string, number: string, input: NewReviewCommentInput, token: string): Promise<void> {
  await githubRequest('POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews`, token, {
    commit_id: input.commitId,
    comments: [{
      path: input.path,
      body: input.body,
      side: input.side,
      line: input.line,
      start_line: input.startLine,
      start_side: input.startSide,
    }],
  })
}

export async function replyToReviewComment(owner: string, repo: string, number: string, rootCommentId: number, body: string, token: string): Promise<void> {
  await githubRequest('POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/comments/${rootCommentId}/replies`, token, { body })
}

export async function updateReviewComment(owner: string, repo: string, commentId: number, body: string, token: string): Promise<void> {
  await githubRequest('PATCH', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/comments/${commentId}`, token, { body })
}

export async function deleteReviewComment(owner: string, repo: string, commentId: number, token: string): Promise<void> {
  await githubRequest('DELETE', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/comments/${commentId}`, token)
}

/** Submits the viewer's pending review with a verdict. */
export async function submitPendingReview(owner: string, repo: string, number: string, reviewId: number, event: ReviewVerdict, body: string, token: string): Promise<void> {
  await githubRequest('POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/events`, token, { event, body })
}

/** Submits a review with no draft comments (e.g. a straight Approve) in one shot. */
export async function createReview(owner: string, repo: string, number: string, event: ReviewVerdict, body: string, token: string): Promise<void> {
  await githubRequest('POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews`, token, { event, body })
}

/** Deletes the viewer's pending review, discarding its draft comments. */
export async function deletePendingReview(owner: string, repo: string, number: string, reviewId: number, token: string): Promise<void> {
  await githubRequest('DELETE', `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`, token)
}
