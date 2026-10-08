import type { PullRequestListItem, PullRequestListPage } from '../../types/pull-request-list'
import type { GitlabUserJson } from './api'
import type { GitlabClient } from './client'
import { encodeProject } from './client'

const PAGE_SIZE = 100

interface GitlabMergeRequestListItemJson {
  iid: number
  title: string
  web_url: string
  draft: boolean
  author: GitlabUserJson | null
  /** Objects rather than bare names because the request asks for `with_labels_details`. */
  labels: { name: string, color: string, description: string | null }[]
  assignees: GitlabUserJson[] | null
  milestone: { title: string } | null
  user_notes_count: number
  created_at: string
  updated_at: string
}

function normalizeUser(user: GitlabUserJson): NonNullable<PullRequestListItem['author']> {
  return { login: user.username, avatarUrl: user.avatar_url ?? undefined }
}

function normalizeItem(item: GitlabMergeRequestListItemJson): PullRequestListItem {
  return {
    number: item.iid,
    title: item.title,
    url: item.web_url,
    state: item.draft ? 'draft' : 'open',
    author: item.author ? normalizeUser(item.author) : undefined,
    labels: item.labels.map(label => ({ name: label.name, color: label.color.replace(/^#/, ''), description: label.description ?? undefined })),
    assignees: (item.assignees ?? []).map(normalizeUser),
    milestone: item.milestone?.title,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.user_notes_count,
  }
}

/**
 * A project's open merge requests, newest activity first, one page per call. Pages
 * chain through the opaque `next` continuation, here GitLab's next page number.
 * The listing carries no approval state, pipeline status or diff size.
 */
export async function fetchOpenMergeRequests(client: GitlabClient, project: string, next = '1'): Promise<PullRequestListPage> {
  const params = new URLSearchParams({
    state: 'opened',
    order_by: 'updated_at',
    sort: 'desc',
    with_labels_details: 'true',
    per_page: String(PAGE_SIZE),
    page: next,
  })
  const res = await client.request(`/projects/${encodeProject(project)}/merge_requests?${params}`)
  const items: GitlabMergeRequestListItemJson[] = await res.json()
  const loaded = (Number(next) - 1) * PAGE_SIZE + items.length
  return {
    // GitLab leaves the total out of very long listings; what has loaded is then the best count there is.
    totalCount: Number(res.headers.get('x-total') ?? loaded),
    items: items.map(normalizeItem),
    next: res.headers.get('x-next-page') || undefined,
  }
}
