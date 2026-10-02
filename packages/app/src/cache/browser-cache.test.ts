import { createStorage } from 'unstorage'
import indexedDbDriver from 'unstorage/drivers/indexedb'
import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'

describe('storage', () => {
  it('lists keys by prefix through the real indexeddb driver (createBrowserCache\'s config)', async () => {
    // Regression test - see browser-cache.ts's own comment on why `dbName`/`storeName`
    // is used instead of `base`.
    const storage = createStorage({ driver: indexedDbDriver({ dbName: 'diffs-cache-test', storeName: 'cache' }) })
    await storage.setItem('pr-meta:github:antfu/diffs#1', { hello: 'world' })
    await storage.setItem('review:sha123', true)

    expect(await storage.getKeys('pr-meta:')).toEqual(['pr-meta:github:antfu:diffs#1'])
  })
})
