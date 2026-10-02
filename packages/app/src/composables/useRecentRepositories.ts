import type { PullRequestListCacheEntry } from '@pulls.review/core/cache'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { useAppContext } from '../app-context'

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
  const { cache } = useAppContext()
  const recent = ref<RecentRepository[]>([])

  async function load() {
    recent.value = (await cache.pullRequestLists.listRecent(limit)).map((entry: PullRequestListCacheEntry) => ({
      owner: entry.owner,
      repo: entry.repo,
      openCount: entry.page.totalCount,
      lastViewedAt: entry.lastViewedAt,
    }))
  }

  return { recent, load }
}
