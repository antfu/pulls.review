import type { Driver } from 'unstorage'
import { createStorage } from 'unstorage'
import indexedDbDriver from 'unstorage/drivers/indexedb'

export type CacheStorage = ReturnType<typeof createStorage>

/**
 * One `unstorage` instance holds every cache collection by key prefix (`pr:*`,
 * `review:*`, ...); `unstorage` is flat key-value. The app context builds it once;
 * tests pass the `memory` driver instead against identical call sites.
 */
export function createCacheStorage(driver: Driver): CacheStorage {
  return createStorage({ driver })
}

export function createBrowserCacheStorage(): CacheStorage {
  // `dbName`/`storeName` (a real object store), not `base` (a plain string
  // prefix) - the driver's `getKeys()` returns raw idb-keyval keys still
  // carrying that prefix, which then fails `storage.getKeys('pr:')`'s own
  // base-match filter, silently returning nothing (see storage.test.ts).
  return createCacheStorage(indexedDbDriver({ dbName: 'diffs-cache', storeName: 'cache' }))
}
