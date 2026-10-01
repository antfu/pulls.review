import indexedDbDriver from 'unstorage/drivers/indexedb'
import { describe, expect, it } from 'vitest'
import { createCacheStorage } from './storage'
import 'fake-indexeddb/auto'

describe('storage', () => {
  it('lists keys by prefix through the real indexeddb driver (getDefaultCacheStorage\'s config)', async () => {
    // Regression test - see storage.ts's own comment on why `dbName`/`storeName`
    // is used instead of `base`.
    const storage = createCacheStorage(indexedDbDriver({ dbName: 'diffs-cache-test', storeName: 'cache' }))
    await storage.setItem('pr:github:antfu/diffs#1', { hello: 'world' })
    await storage.setItem('review:sha123', true)

    expect(await storage.getKeys('pr:')).toEqual(['pr:github:antfu:diffs#1'])
  })
})
