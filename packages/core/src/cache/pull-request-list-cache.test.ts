import type { Storage } from 'unstorage'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeRepositoryRef } from '../types/pull-request-list'
import { createPullRequestListCache } from './pull-request-list-cache'

let storage: Storage
let cache: ReturnType<typeof createPullRequestListCache>

const page = { totalCount: 0, items: [] }
const repo = (owner: string, name: string) => ({ kind: 'github-repo' as const, owner, repo: name })

beforeEach(() => {
  storage = createStorage({ driver: memoryDriver() })
  cache = createPullRequestListCache(storage, 2)
  vi.useRealTimers()
})

describe('pull request list cache', () => {
  it('round-trips a repo page and stamps when it was viewed', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set(repo('o', 'r'), page)

    expect(await cache.get(repo('o', 'r'))).toEqual({ repository: repo('o', 'r'), page, lastViewedAt: 1000 })
    expect(await cache.get(repo('o', 'other'))).toBeUndefined()
  })

  it('treats a previous-shape entry as a miss', async () => {
    await storage.setItem('pulls:o/r', page)
    expect(await cache.get(repo('o', 'r'))).toBeUndefined()
  })

  it('reads an entry written before lists carried a repository ref as that GitHub repository', async () => {
    await storage.setItem('pulls:o/r', { owner: 'o', repo: 'r', page, lastViewedAt: 5 })
    expect(await cache.get(repo('o', 'r'))).toEqual({ repository: repo('o', 'r'), page, lastViewedAt: 5 })
  })

  it('keeps a GitLab project apart from the GitHub repository of the same path', async () => {
    const project = { kind: 'gitlab-project' as const, host: 'gitlab.com', project: 'o/r' }
    await cache.set(project, { totalCount: 7, items: [] })
    expect(await cache.get(repo('o', 'r'))).toBeUndefined()
    expect((await cache.get(project))?.page.totalCount).toBe(7)
  })

  it('lists repositories most recently viewed first, and touching moves one to the front', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set(repo('a', 'x'), page)
    vi.setSystemTime(2000)
    await cache.set(repo('b', 'y'), page)
    expect((await cache.listRecent()).map(entry => serializeRepositoryRef(entry.repository))).toEqual(['b/y', 'a/x'])

    vi.setSystemTime(3000)
    await cache.touch(repo('a', 'x'))
    expect((await cache.listRecent(1)).map(entry => serializeRepositoryRef(entry.repository))).toEqual(['a/x'])
  })

  it('evicts the least recently viewed repositories beyond the cap', async () => {
    vi.useFakeTimers({ now: 1000 })
    await cache.set(repo('a', 'x'), page)
    vi.setSystemTime(2000)
    await cache.set(repo('b', 'y'), page)
    vi.setSystemTime(3000)
    await cache.set(repo('c', 'z'), page)

    expect((await cache.listRecent()).map(entry => serializeRepositoryRef(entry.repository))).toEqual(['c/z', 'b/y'])
  })
})
