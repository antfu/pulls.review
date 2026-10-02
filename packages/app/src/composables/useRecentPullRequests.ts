import type { PullRequestState } from '@pulls.review/core/types'
import type { Ref } from 'vue'
import { parseGithubDiffId } from '@pulls.review/core/github'
import { ref } from 'vue'
import { useAppContext } from '../app-context'

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
 * The home page's "recent" list - the diff cache already tracks every previously
 * viewed PR's `lastViewedAt` for LRU eviction, so this just reads it back. Paste/local
 * entries have no stable route to revisit (paste's key is a content hash, not a URL),
 * so only github-provider entries are surfaced here.
 */
export function useRecentPullRequests(limit = 8): UseRecentPullRequestsReturn {
  const { cache } = useAppContext()
  const recent = ref<RecentPullRequest[]>([])

  async function load() {
    const items: RecentPullRequest[] = []
    for (const meta of await cache.diffs.listRecent(limit)) {
      const ref = parseGithubDiffId(meta.key)
      if (!ref)
        continue
      const reviewed = await cache.reviewMarks.get(meta.fileShas)
      items.push({
        ...ref,
        title: meta.title,
        url: meta.url,
        state: meta.pullRequestState,
        additions: meta.additions,
        deletions: meta.deletions,
        reviewedCount: meta.fileShas.filter(sha => reviewed.has(sha)).length,
        totalFiles: meta.fileShas.length,
        lastViewedAt: meta.lastViewedAt,
      })
    }
    recent.value = items
  }

  return { recent, load }
}
