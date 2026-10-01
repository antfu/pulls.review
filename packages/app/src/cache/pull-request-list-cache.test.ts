import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedPullRequestList, listRecentRepositories, setCachedPullRequestList, touchCachedPullRequestList } from './pull-request-list-cache'
import { createCacheStorage } from './storage'

let storage: ReturnType<typeof createCacheStorage>

const page = { totalCount: 0, items: [] }

beforeEach(() => {
  storage = createCacheStorage(memoryDriver())
  vi.useRealTimers()
})

describe('pull-request-list-cache', () => {
  it('round-trips a repo page and stamps when it was viewed', async () => {
    vi.useFakeTimers({ now: 1000 })
    await setCachedPullRequestList(storage, 'o', 'r', page)

    expect(await getCachedPullRequestList(storage, 'o', 'r')).toEqual({ owner: 'o', repo: 'r', page, lastViewedAt: 1000 })
    expect(await getCachedPullRequestList(storage, 'o', 'other')).toBeUndefined()
  })

  it('treats a previous-shape entry as a miss', async () => {
    await storage.setItem('pulls:o/r', page)
    expect(await getCachedPullRequestList(storage, 'o', 'r')).toBeUndefined()
  })

  it('lists repositories most recently viewed first, and touching moves one to the front', async () => {
    vi.useFakeTimers({ now: 1000 })
    await setCachedPullRequestList(storage, 'a', 'x', page)
    vi.setSystemTime(2000)
    await setCachedPullRequestList(storage, 'b', 'y', page)
    expect((await listRecentRepositories(storage)).map(entry => entry.repo)).toEqual(['y', 'x'])

    vi.setSystemTime(3000)
    await touchCachedPullRequestList(storage, 'a', 'x')
    expect((await listRecentRepositories(storage, 1)).map(entry => entry.repo)).toEqual(['x'])
  })

  it('evicts the least recently viewed repositories beyond the cap', async () => {
    vi.useFakeTimers({ now: 1000 })
    await setCachedPullRequestList(storage, 'a', 'x', page, 2)
    vi.setSystemTime(2000)
    await setCachedPullRequestList(storage, 'b', 'y', page, 2)
    vi.setSystemTime(3000)
    await setCachedPullRequestList(storage, 'c', 'z', page, 2)

    expect((await listRecentRepositories(storage)).map(entry => entry.repo)).toEqual(['z', 'y'])
  })
})
