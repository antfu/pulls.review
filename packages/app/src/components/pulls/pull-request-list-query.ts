import type { PullRequestListItem } from '@pulls.review/core'
import { Fzf } from 'fzf'

export const PULL_REQUEST_SORTS = [
  'recently-updated',
  'least-recently-updated',
  'newest',
  'oldest',
  'most-commented',
  'least-commented',
] as const
export type PullRequestSort = typeof PULL_REQUEST_SORTS[number]

const COMPARATORS: Record<PullRequestSort, (a: PullRequestListItem, b: PullRequestListItem) => number> = {
  'recently-updated': (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  'least-recently-updated': (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  'newest': (a, b) => b.createdAt.localeCompare(a.createdAt),
  'oldest': (a, b) => a.createdAt.localeCompare(b.createdAt),
  'most-commented': (a, b) => b.comments - a.comments || b.updatedAt.localeCompare(a.updatedAt),
  'least-commented': (a, b) => a.comments - b.comments || b.updatedAt.localeCompare(a.updatedAt),
}

export function sortPullRequests(items: PullRequestListItem[], sort: PullRequestSort): PullRequestListItem[] {
  return [...items].sort(COMPARATORS[sort])
}

function searchText(item: PullRequestListItem): string {
  return [item.title, `#${item.number}`, item.author?.login, ...item.labels.map(label => label.name)].filter(Boolean).join(' ')
}

/** fzf-style fuzzy match over title, `#number`, author login and label names; an empty query keeps everything. */
export function filterPullRequests(items: PullRequestListItem[], query: string): PullRequestListItem[] {
  const trimmed = query.trim()
  if (!trimmed)
    return items
  // fzf ranks by score; the caller re-sorts, so the order here doesn't matter.
  return new Fzf(items, { selector: searchText, sort: false }).find(trimmed).map(result => result.item)
}
