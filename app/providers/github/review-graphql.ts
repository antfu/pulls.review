import type { DiffSide, ReviewDraftTarget } from '../../types/comment-threads'
import { GithubApiError } from './api'

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

/**
 * The few review capabilities REST doesn't have live here: thread resolution
 * (status + resolve) and adding a draft comment to an already-pending review.
 * Plain `fetch`, same as the REST layer - no client library.
 */
async function githubGraphql<T>(query: string, variables: Record<string, string | number | null>, token: string): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok)
    throw new GithubApiError(res.status, `GitHub GraphQL request failed (${res.status})`)
  const payload: { data?: T, errors?: { type?: string, message: string }[] } = await res.json()
  if (payload.errors?.length) {
    // GraphQL reports permission problems as FORBIDDEN errors on a 200 - map them
    // to the same error type/status the REST layer throws so gating logic is shared.
    const forbidden = payload.errors.some(error => error.type === 'FORBIDDEN')
    throw new GithubApiError(forbidden ? 403 : 500, payload.errors.map(error => error.message).join('; '))
  }
  if (!payload.data)
    throw new GithubApiError(500, 'GitHub GraphQL response contained no data')
  return payload.data
}

export interface ThreadResolutionInfo {
  /** GraphQL thread node id - the resolve mutation's input. */
  threadId: string
  isResolved: boolean
}

interface ReviewThreadsQueryData {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean, endCursor: string | null }
        nodes: {
          id: string
          isResolved: boolean
          comments: { nodes: { fullDatabaseId: string | null }[] }
        }[]
      }
    } | null
  } | null
}

const REVIEW_THREADS_QUERY = `
query ReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { fullDatabaseId } }
        }
      }
    }
  }
}`

/**
 * Resolution status for every thread on the PR, keyed by the thread's root
 * comment id (the REST-side thread identity, see `CommentThread.rootId`).
 */
export async function fetchThreadResolutions(owner: string, repo: string, number: string, token: string): Promise<Map<number, ThreadResolutionInfo>> {
  const resolutions = new Map<number, ThreadResolutionInfo>()
  let cursor: string | null = null
  for (;;) {
    const data: ReviewThreadsQueryData = await githubGraphql(REVIEW_THREADS_QUERY, { owner, repo, number: Number(number), cursor }, token)
    const connection = data.repository?.pullRequest?.reviewThreads
    if (!connection)
      break
    for (const node of connection.nodes) {
      const rootId = node.comments.nodes[0]?.fullDatabaseId
      if (rootId != null)
        resolutions.set(Number(rootId), { threadId: node.id, isResolved: node.isResolved })
    }
    if (!connection.pageInfo.hasNextPage)
      break
    cursor = connection.pageInfo.endCursor
  }
  return resolutions
}

const RESOLVE_THREAD_MUTATION = `
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`

export async function resolveThread(threadId: string, token: string): Promise<void> {
  await githubGraphql(RESOLVE_THREAD_MUTATION, { threadId }, token)
}

const ADD_PENDING_THREAD_MUTATION = `
mutation AddPendingThread($reviewId: ID!, $path: String!, $body: String!, $line: Int!, $side: DiffSide!, $startLine: Int, $startSide: DiffSide) {
  addPullRequestReviewThread(input: {
    pullRequestReviewId: $reviewId,
    path: $path,
    body: $body,
    line: $line,
    side: $side,
    startLine: $startLine,
    startSide: $startSide
  }) {
    thread { id }
  }
}`

function toGithubSide(side: DiffSide): 'LEFT' | 'RIGHT' {
  return side === 'additions' ? 'RIGHT' : 'LEFT'
}

/**
 * Adds a draft comment thread to an existing pending review. REST can only
 * attach comments at review creation time, so subsequent draft comments go
 * through this mutation instead.
 */
export async function addThreadToPendingReview(reviewNodeId: string, target: ReviewDraftTarget, body: string, token: string): Promise<void> {
  await githubGraphql(ADD_PENDING_THREAD_MUTATION, {
    reviewId: reviewNodeId,
    path: target.path,
    body,
    line: target.line,
    side: toGithubSide(target.side),
    startLine: target.startLine ?? null,
    startSide: target.startSide ? toGithubSide(target.startSide) : null,
  }, token)
}
