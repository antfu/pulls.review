import type { PullRequestListItem } from '@pulls.review/core/types'
import type { AppContext } from '../app-context'
import { createGithubClient } from '@pulls.review/core/github'
import { ref } from 'vue'

export type InboxSection = 'needs-review' | 'assigned' | 'authored' | 'mentioned'

export const INBOX_SECTIONS: InboxSection[] = ['needs-review', 'assigned', 'authored', 'mentioned']

export interface InboxItem extends PullRequestListItem {
  owner: string
  repo: string
  section: InboxSection
}

const SECTION_QUERIES: Record<InboxSection, string> = {
  'needs-review': 'review-requested:@me',
  'assigned': 'assignee:@me',
  'authored': 'author:@me',
  'mentioned': 'mentions:@me',
}

interface SearchIssueJson {
  number: number
  title: string
  html_url: string
  repository_url: string
  draft?: boolean
  user: { login: string, avatar_url: string } | null
  labels: { name: string, color: string, description: string | null }[]
  assignees: { login: string, avatar_url: string }[] | null
  milestone: { title: string } | null
  comments: number
  created_at: string
  updated_at: string
}

/** Normalize one GitHub search result into an inbox row. */
export function normalizeInboxItem(item: SearchIssueJson, section: InboxSection): InboxItem | undefined {
  const match = /\/repos\/([^/]+)\/([^/]+)$/.exec(item.repository_url)
  if (!match)
    return undefined
  return {
    owner: match[1]!,
    repo: match[2]!,
    section,
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.draft ? 'draft' : 'open',
    author: item.user ? { login: item.user.login, avatarUrl: item.user.avatar_url } : undefined,
    labels: item.labels.map(label => ({ name: label.name, color: label.color, description: label.description ?? undefined })),
    assignees: (item.assignees ?? []).map(user => ({ login: user.login, avatarUrl: user.avatar_url })),
    milestone: item.milestone?.title,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments,
  }
}

/**
 * Merge section results into one list: first (highest-priority) section wins
 * per PR, sections stay in priority order, newest activity first inside each.
 */
export function mergeInboxSections(sections: Record<InboxSection, InboxItem[]>): InboxItem[] {
  const seen = new Set<string>()
  const merged: InboxItem[] = []
  for (const section of INBOX_SECTIONS) {
    const items = [...sections[section]].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    for (const item of items) {
      const key = `${item.owner}/${item.repo}#${item.number}`
      if (seen.has(key))
        continue
      seen.add(key)
      merged.push({ ...item, section })
    }
  }
  return merged
}

export interface InboxStore {
  readonly items: InboxItem[]
  readonly isLoading: boolean
  readonly error: Error | undefined
  readonly needsSignIn: boolean
  load: () => Promise<void>
}

/** Cross-repository review inbox over GitHub search, for the signed-in viewer. */
export function createInboxStore(ctx: AppContext): InboxStore {
  const items = ref<InboxItem[]>([])
  const isLoading = ref(false)
  const error = ref<Error>()
  const needsSignIn = ref(false)

  async function load() {
    if (isLoading.value)
      return
    isLoading.value = true
    error.value = undefined
    try {
      const client = createGithubClient(ctx.credentials)
      if (!await client.authenticated()) {
        needsSignIn.value = true
        return
      }
      needsSignIn.value = false
      const entries = await Promise.all(INBOX_SECTIONS.map(async (section) => {
        const params = new URLSearchParams({
          q: `is:pr is:open ${SECTION_QUERIES[section]}`,
          sort: 'updated',
          order: 'desc',
          per_page: '50',
        })
        const res = await client.request(`/search/issues?${params}`)
        const json = await res.json() as { items: SearchIssueJson[] }
        return [section, json.items.flatMap(item => normalizeInboxItem(item, section) ?? [])] as const
      }))
      items.value = mergeInboxSections(Object.fromEntries(entries) as Record<InboxSection, InboxItem[]>)
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    get items() { return items.value },
    get isLoading() { return isLoading.value },
    get error() { return error.value },
    get needsSignIn() { return needsSignIn.value },
    load,
  }
}
