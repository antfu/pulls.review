import type { PullRequestListItem } from '@pulls.review/core'
import { describe, expect, it } from 'vitest'
import { filterPullRequests, sortPullRequests } from './pull-request-list-query'

function item(overrides: Partial<PullRequestListItem> & { number: number }): PullRequestListItem {
  return {
    title: `PR ${overrides.number}`,
    url: '',
    state: 'open',
    labels: [],
    assignees: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    comments: 0,
    ...overrides,
  }
}

const items = [
  item({ number: 1, title: 'feat: virtualize the file tree', author: { login: 'antfu' }, labels: [{ name: 'enhancement', color: '' }], createdAt: '2025-01-03T00:00:00Z', updatedAt: '2025-01-05T00:00:00Z', comments: 2 }),
  item({ number: 2, title: 'fix: dark mode flash', author: { login: 'bob' }, labels: [{ name: 'bug', color: '' }], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-09T00:00:00Z', comments: 7 }),
  item({ number: 30, title: 'docs: typo', author: { login: 'carol' }, createdAt: '2025-01-02T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z', comments: 0 }),
]

describe('filterPullRequests', () => {
  it('keeps everything for an empty or blank query', () => {
    expect(filterPullRequests(items, '')).toBe(items)
    expect(filterPullRequests(items, '   ')).toBe(items)
  })

  it('fuzzy-matches titles', () => {
    expect(filterPullRequests(items, 'drkmode').map(pr => pr.number)).toEqual([2])
    expect(filterPullRequests(items, 'vft').map(pr => pr.number)).toEqual([1])
  })

  it('matches the number, the author and label names too', () => {
    expect(filterPullRequests(items, '#30').map(pr => pr.number)).toEqual([30])
    expect(filterPullRequests(items, 'carol').map(pr => pr.number)).toEqual([30])
    expect(filterPullRequests(items, 'enhancement').map(pr => pr.number)).toEqual([1])
  })
})

describe('sortPullRequests', () => {
  it('orders by the chosen field without mutating the input', () => {
    const numbers = (sort: Parameters<typeof sortPullRequests>[1]) => sortPullRequests(items, sort).map(pr => pr.number)
    expect(numbers('recently-updated')).toEqual([2, 1, 30])
    expect(numbers('least-recently-updated')).toEqual([30, 1, 2])
    expect(numbers('newest')).toEqual([1, 30, 2])
    expect(numbers('oldest')).toEqual([2, 30, 1])
    expect(numbers('most-commented')).toEqual([2, 1, 30])
    expect(numbers('least-commented')).toEqual([30, 1, 2])
    expect(items.map(pr => pr.number)).toEqual([1, 2, 30])
  })
})
