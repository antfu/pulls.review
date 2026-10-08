import type { PullRequestListItem } from '@pulls.review/core/types'
import type { PullRequestListStore } from '../../src/stores/pull-request-list-store'
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
    additions: 812,
    deletions: 44,
    changedFiles: 19,
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
    source: {
      repository: { kind: 'github-repo', owner: 'antfu', repo: 'pulls.review' },
      url: 'https://github.com/antfu/pulls.review/pulls',
      ownerUrl: 'https://github.com/antfu',
      auth: 'github-token',
      fetchPage: async () => ({ totalCount: mockPullRequests.length, items: mockPullRequests }),
    },
    items: mockPullRequests,
    totalCount: mockPullRequests.length,
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    error: undefined,
    viewed: new Map([
      [42, { additions: 812, deletions: 44, files: 19, groups: 5, hasAiResult: true }],
      [40, { additions: 30, deletions: 2, files: 1, groups: 1, hasAiResult: false }],
    ]),
    load: async () => {},
    refresh: async () => {},
    loadMore: async () => {},
    loadAll: async () => {},
    ...overrides,
  })
}
