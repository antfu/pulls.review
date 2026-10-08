import type { Storage } from 'unstorage'
import type { PullRequestListPage, RepositoryRef } from '../types/pull-request-list'
import type { PullRequestListCacheEntry } from './schema'
import * as v from 'valibot'
import { serializeRepositoryRef } from '../types/pull-request-list'
import { PullRequestListCacheEntrySchema } from './schema'

const PULLS_KEY_PREFIX = 'pulls:'
export const DEFAULT_MAX_REPO_ENTRIES = 30

function pullsKey(repository: RepositoryRef): string {
  return `${PULLS_KEY_PREFIX}${serializeRepositoryRef(repository)}`
}

export interface PullRequestListCache {
  get: (repository: RepositoryRef) => Promise<PullRequestListCacheEntry | undefined>
  /** Stores a repo's first page, then evicts the least recently viewed repos beyond the cap. */
  set: (repository: RepositoryRef, page: PullRequestListPage) => Promise<void>
  touch: (repository: RepositoryRef) => Promise<void>
  /** Most-recently-viewed repositories first. */
  listRecent: (limit?: number) => Promise<PullRequestListCacheEntry[]>
}

export function createPullRequestListCache(storage: Storage, maxEntries = DEFAULT_MAX_REPO_ENTRIES): PullRequestListCache {
  async function get(repository: RepositoryRef) {
    const raw = await storage.getItem(pullsKey(repository))
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
    async set(repository, page) {
      await storage.setItem(pullsKey(repository), { repository, page, lastViewedAt: Date.now() } satisfies PullRequestListCacheEntry)
      const evicted = (await listRecent()).slice(maxEntries)
      await Promise.all(evicted.map(stale => storage.removeItem(pullsKey(stale.repository))))
    },
    async touch(repository) {
      const entry = await get(repository)
      if (entry)
        await storage.setItem(pullsKey(repository), { ...entry, lastViewedAt: Date.now() })
    },
  }
}
