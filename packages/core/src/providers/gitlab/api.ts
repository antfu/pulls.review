import type { GitlabClient } from './client'
import { encodeProject, GitlabApiError } from './client'

/** A merge request by its project's full path and its project-scoped number. */
export interface MergeRequestRef { project: string, iid: string }

export interface GitlabUserJson {
  username: string
  name?: string
  avatar_url: string | null
}

export interface GitlabMergeRequestJson {
  title: string
  description: string | null
  state: 'opened' | 'closed' | 'locked' | 'merged'
  draft: boolean
  author: GitlabUserJson | null
  source_branch: string
  target_branch: string
  /** The head commit; `null` until GitLab has prepared the diff. */
  sha: string | null
  /** The three commits the current diff version compares; `null` until GitLab has prepared the diff. */
  diff_refs: { base_sha: string, start_sha: string, head_sha: string } | null
  web_url: string
  created_at: string
  updated_at: string
  /** A count as text; it ends in `+` when GitLab stopped storing files at its limit. */
  changes_count: string | null
}

export interface GitlabDiffJson {
  old_path: string
  new_path: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  /** Hunks only, without the `diff --git` preamble; empty when GitLab left the patch out. */
  diff: string
  /** The patch was left out for being large; the raw diff still has it. */
  collapsed?: boolean
  /** The patch is over GitLab's per-file limit. */
  too_large?: boolean
}

export interface GitlabCommitJson {
  id: string
  message: string
}

export function mergeRequestPath({ project, iid }: MergeRequestRef): string {
  return `/projects/${encodeProject(project)}/merge_requests/${iid}`
}

/** The merge request's page on its instance; a note is addressed by a `#note_<id>` fragment on it. */
export function mergeRequestUrl(host: string, { project, iid }: MergeRequestRef): string {
  return `https://${host}/${project}/-/merge_requests/${iid}`
}

export async function fetchMergeRequest(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabMergeRequestJson> {
  return (await client.request(mergeRequestPath(mr))).json()
}

/** One entry per changed file, up to the instance's file limit (see `GitlabMergeRequestJson.changes_count`). */
export function fetchMergeRequestDiffs(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabDiffJson[]> {
  return client.paginate(`${mergeRequestPath(mr)}/diffs`)
}

/** Newest first, as GitLab lists them. */
export function fetchMergeRequestCommits(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabCommitJson[]> {
  return client.paginate(`${mergeRequestPath(mr)}/commits`)
}

/**
 * The whole merge request as git diff text, which carries what the diffs listing
 * lacks: blob shas, binary markers and the patches the listing collapsed.
 * `undefined` on an instance that predates the endpoint (404).
 */
export async function fetchRawDiff(client: GitlabClient, mr: MergeRequestRef): Promise<string | undefined> {
  try {
    return await (await client.request(`${mergeRequestPath(mr)}/raw_diffs`)).text()
  }
  catch (err) {
    if (err instanceof GitlabApiError && err.status === 404)
      return undefined
    throw err
  }
}

/**
 * A file's full raw content at a commit, branch or tag. `undefined` means the file
 * doesn't exist there - expected for the base side of an added file, or the head
 * side of a removed one - not an error.
 */
export async function fetchFileContentAtRef(client: GitlabClient, project: string, path: string, ref: string): Promise<string | undefined> {
  try {
    return await (await client.request(`/projects/${encodeProject(project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`)).text()
  }
  catch (err) {
    if (err instanceof GitlabApiError && err.status === 404)
      return undefined
    throw err
  }
}
