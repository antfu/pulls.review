import type { PullRequestListPage } from '../types/pull-request-list'
import type { CacheStorage } from './storage'
import * as v from 'valibot'
import { PullRequestListPageSchema } from '../types/pull-request-list'

const PULLS_KEY_PREFIX = 'pulls:'

/**
 * Only a repo's first page is persisted: it's what renders instantly on revisit
 * while the fresh copy loads, and later pages chain off it through `next`.
 * Persisting more would either shrink the list on refresh or need a page-by-page
 * revalidation nobody asked for.
 */
function pullsKey(owner: string, repo: string): string {
  return `${PULLS_KEY_PREFIX}${owner}/${repo}`
}

export async function getCachedPullRequestList(storage: CacheStorage, owner: string, repo: string): Promise<PullRequestListPage | undefined> {
  const raw = await storage.getItem(pullsKey(owner, repo))
  if (raw == null)
    return undefined
  const result = v.safeParse(PullRequestListPageSchema, raw)
  // A corrupt or previous-shape entry is a cache miss, not a crash.
  return result.success ? result.output : undefined
}

export async function setCachedPullRequestList(storage: CacheStorage, owner: string, repo: string, page: PullRequestListPage): Promise<void> {
  await storage.setItem(pullsKey(owner, repo), page)
}
