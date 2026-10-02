import type { Storage } from 'unstorage'
import type { PullRequestListPage } from '../types/pull-request-list'
import type { PullRequestListCacheEntry } from './schema'
import * as v from 'valibot'
import { PullRequestListCacheEntrySchema } from './schema'

const PULLS_KEY_PREFIX = 'pulls:'
export const DEFAULT_MAX_REPO_ENTRIES = 30

function pullsKey(owner: string, repo: string): string {
  return `${PULLS_KEY_PREFIX}${owner}/${repo}`
}

export interface PullRequestListCache {
  get: (owner: string, repo: string) => Promise<PullRequestListCacheEntry | undefined>
  /** Stores a repo's first page, then evicts the least recently viewed repos beyond the cap. */
  set: (owner: string, repo: string, page: PullRequestListPage) => Promise<void>
  touch: (owner: string, repo: string) => Promise<void>
  /** Most-recently-viewed repositories first. */
  listRecent: (limit?: number) => Promise<PullRequestListCacheEntry[]>
}

export function createPullRequestListCache(storage: Storage, maxEntries = DEFAULT_MAX_REPO_ENTRIES): PullRequestListCache {
  async function get(owner: string, repo: string) {
    const raw = await storage.getItem(pullsKey(owner, repo))
    if (raw == null)
      return undefined
    const result = v.safeParse(PullRequestListCacheEntrySchema, raw)
    // A corrupt or previous-shape entry is a cache miss, not a crash.
    return result.success ? result.output : undefined
  }

  async function listRecent(limit = Infinity) {
    const keys = await storage.getKeys(PULLS_KEY_PREFIX)
    const entries: PullRequestListCacheEntry[] = []
    for (const { value } of await storage.getItems(keys)) {
      const result = v.safeParse(PullRequestListCacheEntrySchema, value)
      if (result.success)
        entries.push(result.output)
    }
    return entries.sort((a, b) => b.lastViewedAt - a.lastViewedAt).slice(0, limit)
  }

  return {
    get,
    listRecent,
    async set(owner, repo, page) {
      await storage.setItem(pullsKey(owner, repo), { owner, repo, page, lastViewedAt: Date.now() } satisfies PullRequestListCacheEntry)
      const evicted = (await listRecent()).slice(maxEntries)
      await Promise.all(evicted.map(stale => storage.removeItem(pullsKey(stale.owner, stale.repo))))
    },
    async touch(owner, repo) {
      const entry = await get(owner, repo)
      if (entry)
        await storage.setItem(pullsKey(owner, repo), { ...entry, lastViewedAt: Date.now() })
    },
  }
}
