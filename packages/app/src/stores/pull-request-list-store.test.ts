import type { PullRequestListItem, PullRequestListPage } from '@pulls.review/core'
import type { PrCacheEntry } from '../types/cache'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheStorage } from '../cache/storage'
import { createPullRequestListStore } from './pull-request-list-store'

const mocks = vi.hoisted(() => ({
  fetchOpenPullRequests: vi.fn(),
  storage: undefined as ReturnType<typeof createCacheStorage> | undefined,
}))

vi.mock('@pulls.review/core', async importOriginal => ({
  ...await importOriginal<typeof import('@pulls.review/core')>(),
  fetchOpenPullRequests: mocks.fetchOpenPullRequests,
}))

vi.mock('../cache/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/storage')>()
  return { ...actual, getDefaultCacheStorage: async () => mocks.storage }
})

function item(number: number): PullRequestListItem {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    state: 'open',
    labels: [],
    assignees: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    comments: 0,
  }
}

function page(numbers: number[], totalCount: number, next?: string): PullRequestListPage {
  return { totalCount, items: numbers.map(item), next }
}

function viewedEntry(key: string, analyzedBy: PrCacheEntry['analyzedBy'] = {}): PrCacheEntry {
  return {
    key,
    headSha: 'head',
    analyzedBy,
    lastViewedAt: 0,
    sizeBytes: 0,
    diff: {
      provider: 'github',
      id: key,
      title: 't',
      description: '',
      files: [
        { path: 'src/a.ts', status: 'modified', additions: 10, deletions: 2, isBinary: false, sha: 'a', hunks: [] },
        { path: 'docs/b.md', status: 'added', additions: 5, deletions: 0, isBinary: false, sha: 'b', hunks: [] },
      ],
    },
  }
}

beforeEach(() => {
  mocks.storage = createCacheStorage(memoryDriver())
  mocks.fetchOpenPullRequests.mockReset()
})

describe('createPullRequestListStore', () => {
  it('fetches the first page, exposes it and caches it', async () => {
    mocks.fetchOpenPullRequests.mockResolvedValue(page([3, 2, 1], 3))
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' }, { token: 'tok' })

    await store.load()

    expect(mocks.fetchOpenPullRequests).toHaveBeenCalledWith('o', 'r', 'tok')
    expect(store.items.map(pr => pr.number)).toEqual([3, 2, 1])
    expect(store.totalCount).toBe(3)
    expect(store.hasMore).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(await mocks.storage!.getItem('pulls:o/r')).toMatchObject({ owner: 'o', repo: 'r', page: { totalCount: 3, items: page([3, 2, 1], 3).items } })
  })

  it('shows the cached page while the fresh one loads, then replaces it', async () => {
    await mocks.storage!.setItem('pulls:o/r', { owner: 'o', repo: 'r', page: page([5, 4], 2), lastViewedAt: 0 })
    const { promise, resolve: resolveFetch } = Promise.withResolvers<PullRequestListPage>()
    mocks.fetchOpenPullRequests.mockReturnValue(promise)
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' })

    const loading = store.load()
    await vi.waitFor(() => expect(store.items.map(pr => pr.number)).toEqual([5, 4]))
    expect(store.isLoading).toBe(false)
    expect(store.isRefreshing).toBe(true)

    resolveFetch(page([6, 5, 4], 3))
    await loading

    expect(store.items.map(pr => pr.number)).toEqual([6, 5, 4])
    expect(store.isRefreshing).toBe(false)
  })

  it('appends subsequent pages through the continuation and drains them all on loadAll', async () => {
    mocks.fetchOpenPullRequests
      .mockResolvedValueOnce(page([9, 8], 5, 'p2'))
      .mockResolvedValueOnce(page([7, 6], 5, 'p3'))
      .mockResolvedValueOnce(page([5], 5))
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' })

    await store.load()
    expect(store.hasMore).toBe(true)

    await store.loadAll()

    expect(mocks.fetchOpenPullRequests.mock.calls.map(call => call[3])).toEqual([undefined, 'p2', 'p3'])
    expect(store.items.map(pr => pr.number)).toEqual([9, 8, 7, 6, 5])
    expect(store.hasMore).toBe(false)
    // Only the first page is persisted.
    expect(await mocks.storage!.getItem('pulls:o/r')).toMatchObject({ page: page([9, 8], 5, 'p2') })
  })

  it('surfaces a failed first load as an error and keeps cached rows visible', async () => {
    await mocks.storage!.setItem('pulls:o/r', { owner: 'o', repo: 'r', page: page([1], 1), lastViewedAt: 0 })
    mocks.fetchOpenPullRequests.mockRejectedValue(new Error('rate limited'))
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' })

    await store.load()

    expect(store.error?.message).toBe('rate limited')
    expect(store.items.map(pr => pr.number)).toEqual([1])
  })

  it('decorates rows with what this browser already viewed: diff size, group count, AI availability', async () => {
    await mocks.storage!.setItem('pr:github:o/r#1', viewedEntry('github:o/r#1'))
    const aiGroups = [{ key: 'g1', label: 'One', filePaths: ['src/a.ts', 'docs/b.md'] }]
    await mocks.storage!.setItem('pr:github:o/r#2', viewedEntry('github:o/r#2', { llm: { source: 'llm', schemaVersion: 1, generatedAt: '', groups: aiGroups } }))
    await mocks.storage!.setItem('pr:github:other/r#3', viewedEntry('github:other/r#3'))
    mocks.fetchOpenPullRequests.mockResolvedValue(page([2, 1], 2))
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' })

    await store.load()
    await vi.waitFor(() => expect(store.viewed.size).toBe(2))

    // Two rule-based groups (source vs docs) when no AI result is stored.
    expect(store.viewed.get(1)).toEqual({ additions: 15, deletions: 2, files: 2, groups: 2, hasAiResult: false })
    expect(store.viewed.get(2)).toMatchObject({ groups: 1, hasAiResult: true })
    expect(store.viewed.has(3)).toBe(false)
  })

  it('drops a continuation that resolves after a refresh replaced the list', async () => {
    const { promise, resolve: resolveMore } = Promise.withResolvers<PullRequestListPage>()
    mocks.fetchOpenPullRequests
      .mockResolvedValueOnce(page([2, 1], 4, 'p2'))
      .mockReturnValueOnce(promise)
      .mockResolvedValueOnce(page([3, 2], 3))
    const store = createPullRequestListStore({ owner: 'o', repo: 'r' })
    await store.load()

    const more = store.loadMore()
    await store.refresh()
    resolveMore(page([0], 4))
    await more

    expect(store.items.map(pr => pr.number)).toEqual([3, 2])
    expect(store.hasMore).toBe(false)
  })
})
