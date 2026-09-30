import type { PullRequestListStore } from '../../app/stores/pull-request-list-store'
import type { PullRequestListItem } from '../../app/types/pull-request-list'
import { reactive } from 'vue'
import { octocat, reviewer } from './mock-reviews'

/** Shared mock open-PR fixtures for Storybook stories. */

export function mockPullRequest(overrides: Partial<PullRequestListItem> & { number: number }): PullRequestListItem {
  return {
    title: `feat: change #${overrides.number}`,
    url: `https://github.com/antfu/pulls.review/pull/${overrides.number}`,
    state: 'open',
    author: reviewer,
    labels: [],
    assignees: [],
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-09-29T10:00:00Z',
    comments: 0,
    ...overrides,
  }
}

export const mockPullRequests: PullRequestListItem[] = [
  mockPullRequest({
    number: 42,
    title: 'feat: list a repository\'s open pull requests',
    labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature or request' }, { name: 'ui', color: 'd876e3' }],
    assignees: [reviewer, octocat],
    milestone: 'v1.0',
    comments: 12,
    reviewDecision: 'approved',
    checks: 'success',
    linkedIssues: 2,
  }),
  mockPullRequest({
    number: 41,
    title: 'fix: dark mode flash on first paint',
    state: 'draft',
    author: octocat,
    labels: [{ name: 'bug', color: 'd73a4a', description: 'Something isn\'t working' }],
    comments: 3,
    reviewDecision: 'changes_requested',
    checks: 'failure',
    createdAt: '2026-09-20T10:00:00Z',
  }),
  mockPullRequest({
    number: 40,
    title: 'docs: explain the provider boundary and how caching interacts with the analyze adapters when a diff is refreshed',
    labels: [{ name: 'documentation', color: '0075ca' }],
    reviewDecision: 'review_required',
    checks: 'pending',
    createdAt: '2026-08-01T10:00:00Z',
  }),
  mockPullRequest({ number: 39, title: 'chore: bump dependencies', author: undefined, comments: 1 }),
]

export function createMockPullRequestListStore(overrides: Partial<PullRequestListStore> = {}): PullRequestListStore {
  return reactive({
    owner: 'antfu',
    repo: 'pulls.review',
    items: mockPullRequests,
    totalCount: mockPullRequests.length,
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    error: undefined,
    load: async () => {},
    refresh: async () => {},
    loadMore: async () => {},
    loadAll: async () => {},
    ...overrides,
  })
}
