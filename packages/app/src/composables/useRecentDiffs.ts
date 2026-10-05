import type { PullRequestState } from '@pulls.review/core/types'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { useAppContext } from '../app-context'
import { parentForRef, routeForRef } from '../source-routes'

export interface RecentDiff {
  route: string
  /** Where the diff sits, e.g. `owner/repo`. */
  parent?: string
  label?: string
  title: string
  state?: PullRequestState
  reviewedCount: number
  totalFiles: number
  lastViewedAt: number
}

/**
 * The home page's "recent" list - the diff cache already tracks every previously
 * viewed diff's `lastViewedAt` for LRU eviction, so this just reads it back. Only
 * diffs with a route to revisit are listed (a paste has none by design).
 */
export function useRecentDiffs(limit = 8): { recent: Ref<RecentDiff[]>, load: () => Promise<void> } {
  const { cache } = useAppContext()
  const recent = ref<RecentDiff[]>([])

  async function load() {
    const items: RecentDiff[] = []
    for (const meta of await cache.diffs.listRecent(limit)) {
      const route = routeForRef(meta.ref)
      if (!route)
        continue
      const reviewed = await cache.reviewMarks.get(meta.fileShas)
      items.push({
        route,
        parent: parentForRef(meta.ref)?.label,
        label: meta.label,
        title: meta.title,
        state: meta.pullRequestState,
        reviewedCount: meta.fileShas.filter(sha => reviewed.has(sha)).length,
        totalFiles: meta.fileShas.length,
        lastViewedAt: meta.lastViewedAt,
      })
    }
    recent.value = items
  }

  return { recent, load }
}
