import type { CacheRepositories } from '@pulls.review/core/cache'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { createStorage } from 'unstorage'
import indexedDbDriver from 'unstorage/drivers/indexedb'

export function createBrowserCache(): CacheRepositories {
  // `dbName`/`storeName` (a real object store), not `base` (a plain string
  // prefix) - the driver's `getKeys()` returns raw idb-keyval keys still
  // carrying that prefix, which then fails `storage.getKeys('pr-meta:')`'s own
  // base-match filter, silently returning nothing (see browser-cache.test.ts).
  return createCacheRepositories(createStorage({ driver: indexedDbDriver({ dbName: 'diffs-cache', storeName: 'cache' }) }))
}
