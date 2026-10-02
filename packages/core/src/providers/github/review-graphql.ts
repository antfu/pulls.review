import type { DiffSide, ReviewDraftTarget } from '../../types/comment-threads'
import type { GithubClient } from './client'

/**
 * The few review capabilities REST doesn't have live here: thread resolution
 * (status + resolve) and adding a draft comment to an already-pending review.
 */

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
export async function fetchThreadResolutions(client: GithubClient, owner: string, repo: string, number: string): Promise<Map<number, ThreadResolutionInfo>> {
  const resolutions = new Map<number, ThreadResolutionInfo>()
  let cursor: string | null = null
  for (;;) {
    const data: ReviewThreadsQueryData = await client.graphql(REVIEW_THREADS_QUERY, { owner, repo, number: Number(number), cursor })
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

export async function resolveThread(client: GithubClient, threadId: string): Promise<void> {
  await client.graphql(RESOLVE_THREAD_MUTATION, { threadId })
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
export async function addThreadToPendingReview(client: GithubClient, reviewNodeId: string, target: ReviewDraftTarget, body: string): Promise<void> {
  await client.graphql(ADD_PENDING_THREAD_MUTATION, {
    reviewId: reviewNodeId,
    path: target.path,
    body,
    line: target.line,
    side: toGithubSide(target.side),
    startLine: target.startLine ?? null,
    startSide: target.startSide ? toGithubSide(target.startSide) : null,
  })
}
