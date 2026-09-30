import type { PullRequestListItem, PullRequestListPage } from '../types/pull-request-list'
import { computed, reactive, ref, shallowRef } from 'vue'
import { getCachedPullRequestList, setCachedPullRequestList } from '../cache/pull-request-list-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { fetchOpenPullRequests } from '../providers/github/pull-request-list'

export interface PullRequestListStore {
  readonly owner: string
  readonly repo: string
  readonly items: PullRequestListItem[]
  /** Open PR count for the whole repo (not just the loaded pages); unset until the first page lands. */
  readonly totalCount: number | undefined
  /** First load with nothing to show yet. */
  readonly isLoading: boolean
  /** A fresh first page is on its way while the current (cached or previous) list stays visible. */
  readonly isRefreshing: boolean
  readonly isLoadingMore: boolean
  readonly hasMore: boolean
  readonly error: Error | undefined
  load: () => Promise<void>
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  /** Fetches every remaining page - client-side search needs the full set to be trustworthy. */
  loadAll: () => Promise<void>
}

export interface PullRequestListStoreOptions {
  token?: string
}

/**
 * Stale-while-revalidate over a repo's open PRs: the cached first page (if any)
 * renders instantly, a fresh first page replaces it, further pages append. Lists
 * cost nothing to refetch (no AI run hangs off them), so unlike `DiffsStore` the
 * refresh happens silently on every visit.
 */
export function createPullRequestListStore(params: { owner: string, repo: string }, opts: PullRequestListStoreOptions = {}): PullRequestListStore {
  const { owner, repo } = params
  const items = shallowRef<PullRequestListItem[]>([])
  const totalCount = ref<number>()
  const next = ref<string>()
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const isLoadingMore = ref(false)
  const error = ref<Error>()
  // Bumped by every first-page fetch so a slower, older response can't overwrite a newer list.
  let generation = 0

  function installFirstPage(page: PullRequestListPage) {
    items.value = page.items
    totalCount.value = page.totalCount
    next.value = page.next
  }

  async function fetchFirstPage() {
    const current = ++generation
    error.value = undefined
    try {
      const page = await fetchOpenPullRequests(owner, repo, opts.token)
      if (current !== generation)
        return
      installFirstPage(page)
      const storage = await getDefaultCacheStorage()
      await setCachedPullRequestList(storage, owner, repo, page)
    }
    catch (err) {
      if (current === generation)
        error.value = err instanceof Error ? err : new Error(String(err))
    }
  }

  async function load() {
    const storage = await getDefaultCacheStorage()
    const cached = await getCachedPullRequestList(storage, owner, repo)
    if (cached)
      installFirstPage(cached)
    const flag = cached ? isRefreshing : isLoading
    flag.value = true
    try {
      await fetchFirstPage()
    }
    finally {
      flag.value = false
    }
  }

  async function refresh() {
    isRefreshing.value = true
    try {
      await fetchFirstPage()
    }
    finally {
      isRefreshing.value = false
    }
  }

  async function loadMore() {
    const cursor = next.value
    if (!cursor || isLoadingMore.value)
      return
    const current = generation
    isLoadingMore.value = true
    error.value = undefined
    try {
      const page = await fetchOpenPullRequests(owner, repo, opts.token, cursor)
      // A refresh landed meanwhile: its first page supersedes this continuation.
      if (current !== generation)
        return
      items.value = [...items.value, ...page.items]
      totalCount.value = page.totalCount
      next.value = page.next
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      isLoadingMore.value = false
    }
  }

  async function loadAll() {
    while (next.value && !error.value)
      await loadMore()
  }

  return reactive({
    owner,
    repo,
    items,
    totalCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore: computed(() => next.value !== undefined),
    error,
    load,
    refresh,
    loadMore,
    loadAll,
  }) as PullRequestListStore
}
