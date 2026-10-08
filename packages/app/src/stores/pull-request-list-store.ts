import type { CacheRepositories } from '@pulls.review/core/cache'
import type { DiffSource, DiffsPayload, PullRequestListItem, PullRequestListPage, RepositoryRef } from '@pulls.review/core/types'
import { pullRequestOf, serializeRepositoryRef } from '@pulls.review/core/types'
import { computed, reactive, ref, shallowRef } from 'vue'
import { ruleBasedAdapter } from '../analyze'

/** One repository's open pull requests on its host, already bound to credentials. */
export interface PullRequestListSource {
  repository: RepositoryRef
  /** The list's own page on the host, and its namespace's. */
  url: string
  ownerUrl: string
  /** The credential a failed load can be retried with. */
  auth: NonNullable<DiffSource['auth']>
  /** One page; `next` is the continuation the previous page returned. */
  fetchPage: (next?: string) => Promise<PullRequestListPage>
}

/** What this browser already holds for a PR it viewed before (see `pr:*` in the cache). */
export interface ViewedPullRequest {
  additions: number
  deletions: number
  files: number
  /** From the AI result when one is stored, else the always-available rule-based grouping. */
  groups: number
  hasAiResult: boolean
}

export interface PullRequestListStore {
  readonly source: PullRequestListSource
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
  /** Locally cached diffs of this repo, by PR number. */
  readonly viewed: ReadonlyMap<number, ViewedPullRequest>
  load: () => Promise<void>
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  /** Fetches every remaining page - client-side search needs the full set to be trustworthy. */
  loadAll: () => Promise<void>
}

export interface PullRequestListStoreOptions {
  cache: CacheRepositories
}

/**
 * Stale-while-revalidate over a repo's open PRs: the cached first page (if any)
 * renders instantly, a fresh first page replaces it, further pages append. Lists
 * cost nothing to refetch (no AI run hangs off them), so unlike `DiffsStore` the
 * refresh happens silently on every visit.
 */
export function createPullRequestListStore(source: PullRequestListSource, opts: PullRequestListStoreOptions): PullRequestListStore {
  const { repository } = source
  const { cache } = opts
  const items = shallowRef<PullRequestListItem[]>([])
  const totalCount = ref<number>()
  const next = ref<string>()
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const isLoadingMore = ref(false)
  const error = ref<Error>()
  const viewed = shallowRef(new Map<number, ViewedPullRequest>())
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
      const page = await source.fetchPage()
      if (current !== generation)
        return
      installFirstPage(page)
      await cache.pullRequestLists.set(repository, page)
    }
    catch (err) {
      if (current === generation)
        error.value = err instanceof Error ? err : new Error(String(err))
    }
  }

  async function loadViewed() {
    const next = new Map<number, ViewedPullRequest>()
    const key = serializeRepositoryRef(repository)
    const numberHere = (ref: DiffsPayload['ref']) => {
      const pullRequest = pullRequestOf(ref)
      return pullRequest && serializeRepositoryRef(pullRequest.repository) === key ? pullRequest.number : undefined
    }
    for (const entry of await cache.diffs.listMatching(({ ref }) => numberHere(ref) !== undefined)) {
      const aiResult = entry.analyzedBy.llm ?? entry.analyzedBy['web-llm']
      next.set(numberHere(entry.diff.ref)!, {
        additions: entry.diff.files.reduce((sum, file) => sum + file.additions, 0),
        deletions: entry.diff.files.reduce((sum, file) => sum + file.deletions, 0),
        files: entry.diff.files.length,
        groups: aiResult ? aiResult.groups.length : (await ruleBasedAdapter.analyze(entry.diff)).groups.length,
        hasAiResult: !!aiResult,
      })
    }
    viewed.value = next
  }

  async function load() {
    // Independent of the network: what's viewed locally decorates rows whenever they arrive.
    void loadViewed()
    const cached = await cache.pullRequestLists.get(repository)
    if (cached) {
      installFirstPage(cached.page)
      // Counts as a visit even if the refresh below fails (offline, rate-limited).
      await cache.pullRequestLists.touch(repository)
    }
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
      const page = await source.fetchPage(cursor)
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
    source,
    items,
    totalCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore: computed(() => next.value !== undefined),
    error,
    viewed,
    load,
    refresh,
    loadMore,
    loadAll,
  }) as PullRequestListStore
}
