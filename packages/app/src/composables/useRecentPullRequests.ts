import type { PullRequestState } from '@pulls.review/core/types'
import type { Ref } from 'vue'
import { parseGithubDiffId } from '@pulls.review/core/github'
import { ref } from 'vue'
import { listRecentEntries } from '../cache/pr-cache'
import { getReviewed } from '../cache/review-cache'
import { getDefaultCacheStorage } from '../cache/storage'

export interface RecentPullRequest {
  owner: string
  repo: string
  number: string
  title: string
  url?: string
  state?: PullRequestState
  additions: number
  deletions: number
  reviewedCount: number
  totalFiles: number
  lastViewedAt: number
}

export interface UseRecentPullRequestsReturn {
  recent: Ref<RecentPullRequest[]>
  load: () => Promise<void>
}

/**
 * The home page's "recent" list - the `pr:*` cache already tracks every previously
 * viewed PR's `lastViewedAt` for LRU eviction, so this just reads it back. Paste/local
 * entries have no stable route to revisit (paste's key is a content hash, not a URL),
 * so only github-provider entries are surfaced here.
 */
export function useRecentPullRequests(limit = 8): UseRecentPullRequestsReturn {
  const recent = ref<RecentPullRequest[]>([])

  async function load() {
    const storage = await getDefaultCacheStorage()
    const entries = await listRecentEntries(storage, limit)

    const items: RecentPullRequest[] = []
    for (const entry of entries) {
      const { diff } = entry
      const ref = parseGithubDiffId(diff.id)
      if (!ref)
        continue
      const reviewed = await getReviewed(storage, diff.files.map(file => file.sha))
      items.push({
        ...ref,
        title: diff.title,
        url: diff.url,
        state: diff.pullRequest?.state,
        additions: diff.files.reduce((sum, file) => sum + file.additions, 0),
        deletions: diff.files.reduce((sum, file) => sum + file.deletions, 0),
        reviewedCount: diff.files.filter(file => reviewed.has(file.sha)).length,
        totalFiles: diff.files.length,
        lastViewedAt: entry.lastViewedAt,
      })
    }
    recent.value = items
  }

  return { recent, load }
}
