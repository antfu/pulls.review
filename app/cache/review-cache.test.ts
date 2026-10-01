import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { getReviewed, pruneOrphanedReviewed, setReviewed } from './review-cache'
import { createCacheStorage } from './storage'

let storage: ReturnType<typeof createCacheStorage>

beforeEach(() => {
  storage = createCacheStorage(memoryDriver())
})

describe('review-cache', () => {
  it('marks and reads back reviewed shas', async () => {
    await setReviewed(storage, ['sha-a', 'sha-c'], true)
    const reviewed = await getReviewed(storage, ['sha-a', 'sha-b', 'sha-c'])
    expect(reviewed).toEqual(new Set(['sha-a', 'sha-c']))
  })

  it('unmarks a reviewed sha', async () => {
    await setReviewed(storage, ['sha-a'], true)
    await setReviewed(storage, ['sha-a'], false)
    const reviewed = await getReviewed(storage, ['sha-a'])
    expect(reviewed.size).toBe(0)
  })

  it('prunes review marks whose sha is no longer referenced by any cached PR', async () => {
    await setReviewed(storage, ['sha-a', 'sha-b'], true)
    await pruneOrphanedReviewed(storage, new Set(['sha-a']))
    const reviewed = await getReviewed(storage, ['sha-a', 'sha-b'])
    expect(reviewed).toEqual(new Set(['sha-a']))
  })
})
