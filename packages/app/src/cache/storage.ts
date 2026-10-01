import type { Driver } from 'unstorage'
import { createStorage } from 'unstorage'

export type CacheStorage = ReturnType<typeof createStorage>

let instance: CacheStorage | undefined

/**
 * Single `unstorage` instance shared by `pr-cache.ts`/`review-cache.ts` via key
 * prefixes (`pr:*`, `review:*`) rather than separate stores; `unstorage` is flat
 * key-value. Runtime uses the `indexedDB` driver; `createCacheStorage(driver)`
 * lets tests inject the `memory` driver instead against identical call sites.
 */
export function createCacheStorage(driver: Driver): CacheStorage {
  return createStorage({ driver })
}

export async function getDefaultCacheStorage(): Promise<CacheStorage> {
  if (!instance) {
    const { default: indexedDbDriver } = await import('unstorage/drivers/indexedb')
    // `dbName`/`storeName` (a real object store), not `base` (a plain string
    // prefix) - the driver's `getKeys()` returns raw idb-keyval keys still
    // carrying that prefix, which then fails `storage.getKeys('pr:')`'s own
    // base-match filter, silently returning nothing (see storage.test.ts).
    instance = createCacheStorage(indexedDbDriver({ dbName: 'diffs-cache', storeName: 'cache' }))
  }
  return instance
}
