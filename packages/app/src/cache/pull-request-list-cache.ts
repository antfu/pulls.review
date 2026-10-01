import type { CacheStorage } from './storage'
import { PullRequestListPageSchema } from '@pulls.review/core'
import * as v from 'valibot'

const PULLS_KEY_PREFIX = 'pulls:'
export const DEFAULT_MAX_REPO_ENTRIES = 30

/**
 * Only a repo's first page is persisted: it's what renders instantly on revisit
 * while the fresh copy loads, and later pages chain off it through `next`.
 * Persisting more would either shrink the list on refresh or need a page-by-page
 * revalidation nobody asked for. `lastViewedAt` doubles as the home page's
 * "recent repositories" order and the LRU eviction key.
 */
export const PullRequestListCacheEntrySchema = v.object({
  owner: v.string(),
  repo: v.string(),
  page: PullRequestListPageSchema,
  lastViewedAt: v.number(),
})
export type PullRequestListCacheEntry = v.InferOutput<typeof PullRequestListCacheEntrySchema>

function pullsKey(owner: string, repo: string): string {
  return `${PULLS_KEY_PREFIX}${owner}/${repo}`
}

export async function getCachedPullRequestList(storage: CacheStorage, owner: string, repo: string): Promise<PullRequestListCacheEntry | undefined> {
  const raw = await storage.getItem(pullsKey(owner, repo))
  if (raw == null)
    return undefined
  const result = v.safeParse(PullRequestListCacheEntrySchema, raw)
  // A corrupt or previous-shape entry is a cache miss, not a crash.
  return result.success ? result.output : undefined
}

export async function setCachedPullRequestList(storage: CacheStorage, owner: string, repo: string, page: PullRequestListCacheEntry['page'], maxEntries = DEFAULT_MAX_REPO_ENTRIES): Promise<void> {
  const entry: PullRequestListCacheEntry = { owner, repo, page, lastViewedAt: Date.now() }
  await storage.setItem(pullsKey(owner, repo), entry)
  const evicted = (await listRecentRepositories(storage)).slice(maxEntries)
  await Promise.all(evicted.map(stale => storage.removeItem(pullsKey(stale.owner, stale.repo))))
}

export async function touchCachedPullRequestList(storage: CacheStorage, owner: string, repo: string): Promise<void> {
  const entry = await getCachedPullRequestList(storage, owner, repo)
  if (entry)
    await storage.setItem(pullsKey(owner, repo), { ...entry, lastViewedAt: Date.now() })
}

/** Most-recently-viewed repositories first. */
export async function listRecentRepositories(storage: CacheStorage, limit = Infinity): Promise<PullRequestListCacheEntry[]> {
  const keys = await storage.getKeys(PULLS_KEY_PREFIX)
  const entries: PullRequestListCacheEntry[] = []
  for (const { value } of await storage.getItems(keys)) {
    const result = v.safeParse(PullRequestListCacheEntrySchema, value)
    if (result.success)
      entries.push(result.output)
  }
  return entries.sort((a, b) => b.lastViewedAt - a.lastViewedAt).slice(0, limit)
}
