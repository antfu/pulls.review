import type { Storage } from 'unstorage'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPullRequestListCache } from './pull-request-list-cache'

let storage: Storage
let cache: ReturnType<typeof createPullRequestListCache>

const page = { totalCount: 0, items: [] }

beforeEach(() => {
  storage = createStorage({ driver: memoryDriver() })
  cache = createPullRequestListCache(storage, 2)
  vi.useRealTimers()
})

describe('pull request list cache', () => {
  it('round-trips a repo page and stamps when it was viewed', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set('o', 'r', page)

    expect(await cache.get('o', 'r')).toEqual({ owner: 'o', repo: 'r', page, lastViewedAt: 1000 })
    expect(await cache.get('o', 'other')).toBeUndefined()
  })

  it('treats a previous-shape entry as a miss', async () => {
    await storage.setItem('pulls:o/r', page)
    expect(await cache.get('o', 'r')).toBeUndefined()
  })

  it('lists repositories most recently viewed first, and touching moves one to the front', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set('a', 'x', page)
    vi.setSystemTime(2000)
    await cache.set('b', 'y', page)
    expect((await cache.listRecent()).map(entry => entry.repo)).toEqual(['y', 'x'])

    vi.setSystemTime(3000)
    await cache.touch('a', 'x')
    expect((await cache.listRecent(1)).map(entry => entry.repo)).toEqual(['x'])
  })

  it('evicts the least recently viewed repositories beyond the cap', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set('a', 'x', page)
    vi.setSystemTime(2000)
    await cache.set('b', 'y', page)
    vi.setSystemTime(3000)
    await cache.set('c', 'z', page)

    expect((await cache.listRecent()).map(entry => entry.repo)).toEqual(['z', 'y'])
  })
})
