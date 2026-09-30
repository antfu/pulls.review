import type { Ref } from 'vue'
import type { PullRequestListCacheEntry } from '../cache/pull-request-list-cache'
import { ref } from 'vue'
import { listRecentRepositories } from '../cache/pull-request-list-cache'
import { getDefaultCacheStorage } from '../cache/storage'

export interface RecentRepository {
  owner: string
  repo: string
  openCount: number
  lastViewedAt: number
}

/**
 * The home page's "recent repositories" list, read back from the `pulls:*` cache
 * the same way `useRecentPullRequests` reads `pr:*`.
 */
export function useRecentRepositories(limit = 8): { recent: Ref<RecentRepository[]>, load: () => Promise<void> } {
  const recent = ref<RecentRepository[]>([])

  async function load() {
    const storage = await getDefaultCacheStorage()
    recent.value = (await listRecentRepositories(storage, limit)).map((entry: PullRequestListCacheEntry) => ({
      owner: entry.owner,
      repo: entry.repo,
      openCount: entry.page.totalCount,
      lastViewedAt: entry.lastViewedAt,
    }))
  }

  return { recent, load }
}
