import type { ChecksStatus, PullRequestListItem, PullRequestListPage, ReviewDecision } from '../../types/pull-request-list'
import type { GithubUserJson } from './review-api'
import { githubRequest } from './review-api'
import { githubGraphql } from './review-graphql'

const GITHUB_API_BASE = 'https://api.github.com'
const PAGE_SIZE = 100

/**
 * A repository's open pull requests, newest activity first, one page per call.
 * Two transports feed the same canonical `PullRequestListPage`: the REST search
 * endpoint works without a token, and GraphQL search (token required) adds what
 * REST can't see - review decision, CI rollup, linked issues. Pages chain through
 * the opaque `next` continuation (a page number for REST, a cursor for GraphQL).
 */
export function fetchOpenPullRequests(owner: string, repo: string, token: string | undefined, next?: string): Promise<PullRequestListPage> {
  return token
    ? fetchViaGraphql(owner, repo, token, next)
    : fetchViaRest(owner, repo, next)
}

function searchQuery(owner: string, repo: string): string {
  return `repo:${owner}/${repo} is:pr is:open`
}

function normalizeUser(user: GithubUserJson): NonNullable<PullRequestListItem['author']> {
  return { login: user.login, avatarUrl: user.avatar_url }
}

// --- REST ---

interface GithubSearchIssueJson {
  number: number
  title: string
  html_url: string
  draft?: boolean
  user: GithubUserJson | null
  labels: { name: string, color: string, description: string | null }[]
  assignees: GithubUserJson[] | null
  milestone: { title: string } | null
  comments: number
  created_at: string
  updated_at: string
}

interface GithubSearchIssuesJson {
  total_count: number
  items: GithubSearchIssueJson[]
}

/** The search API refuses to page past its first 1000 results. */
const REST_SEARCH_RESULT_CAP = 1000

async function fetchViaRest(owner: string, repo: string, next: string | undefined): Promise<PullRequestListPage> {
  const page = next ? Number(next) : 1
  const params = new URLSearchParams({
    q: searchQuery(owner, repo),
    sort: 'updated',
    order: 'desc',
    per_page: String(PAGE_SIZE),
    page: String(page),
  })
  const res = await githubRequest('GET', `${GITHUB_API_BASE}/search/issues?${params}`, undefined)
  const json: GithubSearchIssuesJson = await res.json()
  const loaded = page * PAGE_SIZE
  const hasMore = json.items.length === PAGE_SIZE && loaded < Math.min(json.total_count, REST_SEARCH_RESULT_CAP)
  return {
    totalCount: json.total_count,
    items: json.items.map(normalizeRestItem),
    next: hasMore ? String(page + 1) : undefined,
  }
}

function normalizeRestItem(item: GithubSearchIssueJson): PullRequestListItem {
  return {
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.draft ? 'draft' : 'open',
    author: item.user ? normalizeUser(item.user) : undefined,
    labels: item.labels.map(label => ({ name: label.name, color: label.color, description: label.description ?? undefined })),
    assignees: (item.assignees ?? []).map(normalizeUser),
    milestone: item.milestone?.title,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments,
  }
}

// --- GraphQL ---

interface GraphqlActor { login: string, avatarUrl: string }

interface GraphqlPullRequestNode {
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  author: GraphqlActor | null
  labels: { nodes: { name: string, color: string, description: string | null }[] } | null
  assignees: { nodes: GraphqlActor[] }
  milestone: { title: string } | null
  comments: { totalCount: number }
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  closingIssuesReferences: { totalCount: number } | null
  commits: { nodes: { commit: { statusCheckRollup: { state: 'EXPECTED' | 'ERROR' | 'FAILURE' | 'PENDING' | 'SUCCESS' } | null } }[] }
  additions: number
  deletions: number
  changedFiles: number
}

interface OpenPullRequestsQueryData {
  search: {
    issueCount: number
    pageInfo: { hasNextPage: boolean, endCursor: string | null }
    /** Search results are a union; anything that isn't a PullRequest comes back as `{}`. */
    nodes: (GraphqlPullRequestNode | Record<string, never>)[]
  }
}

const OPEN_PULL_REQUESTS_QUERY = `
query OpenPullRequests($query: String!, $first: Int!, $cursor: String) {
  search(query: $query, type: ISSUE, first: $first, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url isDraft createdAt updatedAt
        author { login avatarUrl }
        labels(first: 20) { nodes { name color description } }
        assignees(first: 10) { nodes { login avatarUrl } }
        milestone { title }
        comments { totalCount }
        reviewDecision
        closingIssuesReferences { totalCount }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        additions deletions changedFiles
      }
    }
  }
}`

async function fetchViaGraphql(owner: string, repo: string, token: string, cursor: string | undefined): Promise<PullRequestListPage> {
  const data: OpenPullRequestsQueryData = await githubGraphql(OPEN_PULL_REQUESTS_QUERY, {
    query: `${searchQuery(owner, repo)} sort:updated-desc`,
    first: PAGE_SIZE,
    cursor: cursor ?? null,
  }, token)
  const { issueCount, pageInfo, nodes } = data.search
  return {
    totalCount: issueCount,
    items: nodes.filter((node): node is GraphqlPullRequestNode => 'number' in node).map(normalizeGraphqlNode),
    next: pageInfo.hasNextPage && pageInfo.endCursor ? pageInfo.endCursor : undefined,
  }
}

const REVIEW_DECISION: Record<NonNullable<GraphqlPullRequestNode['reviewDecision']>, ReviewDecision> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  REVIEW_REQUIRED: 'review_required',
}

const CHECKS_STATUS: Record<NonNullable<GraphqlPullRequestNode['commits']['nodes'][number]['commit']['statusCheckRollup']>['state'], ChecksStatus> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'pending',
  EXPECTED: 'pending',
}

function normalizeGraphqlNode(node: GraphqlPullRequestNode): PullRequestListItem {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    state: node.isDraft ? 'draft' : 'open',
    author: node.author ? { login: node.author.login, avatarUrl: node.author.avatarUrl } : undefined,
    labels: (node.labels?.nodes ?? []).map(label => ({ name: label.name, color: label.color, description: label.description ?? undefined })),
    assignees: node.assignees.nodes.map(user => ({ login: user.login, avatarUrl: user.avatarUrl })),
    milestone: node.milestone?.title,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    comments: node.comments.totalCount,
    reviewDecision: node.reviewDecision ? REVIEW_DECISION[node.reviewDecision] : undefined,
    checks: rollup ? CHECKS_STATUS[rollup.state] : undefined,
    linkedIssues: node.closingIssuesReferences?.totalCount ?? 0,
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
  }
}
