import type { GitlabUserJson, MergeRequestRef } from './api'
import type { GitlabClient } from './client'
import type { GitlabPositionJson } from './position'
import { diagnostics } from '../../diagnostics'
import { mergeRequestPath } from './api'
import { GitlabApiError } from './client'

export interface GitlabNoteJson {
  id: number
  /** `DiffNote` on a diff line; `DiscussionNote` or `null` on the merge request itself. */
  type: string | null
  body: string
  author: GitlabUserJson | null
  created_at: string
  updated_at: string
  /** Written by GitLab to record an event (a push, a label change), not by a person. */
  system: boolean
  resolvable?: boolean
  resolved?: boolean
  position?: GitlabPositionJson
}

export interface GitlabDiscussionJson {
  id: string
  notes: GitlabNoteJson[]
}

export interface GitlabApprovalsJson {
  approved_by: { user: GitlabUserJson & { id: number }, approved_at?: string }[]
}

/** Needs a token even on a public project. */
export function fetchDiscussions(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabDiscussionJson[]> {
  return client.paginate(`${mergeRequestPath(mr)}/discussions`)
}

export async function fetchApprovals(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabApprovalsJson> {
  return (await client.request(`${mergeRequestPath(mr)}/approvals`)).json()
}

/** Starts a thread on a diff line. */
export async function createDiffDiscussion(client: GitlabClient, mr: MergeRequestRef, body: string, position: GitlabPositionJson): Promise<void> {
  await client.request(`${mergeRequestPath(mr)}/discussions`, { method: 'POST', body: { body, position } })
}

export async function replyToDiscussion(client: GitlabClient, mr: MergeRequestRef, discussionId: string, body: string): Promise<void> {
  await client.request(`${mergeRequestPath(mr)}/discussions/${discussionId}/notes`, { method: 'POST', body: { body } })
}

export async function setDiscussionResolved(client: GitlabClient, mr: MergeRequestRef, discussionId: string, resolved: boolean): Promise<void> {
  await client.request(`${mergeRequestPath(mr)}/discussions/${discussionId}`, { method: 'PUT', body: { resolved } })
}

/** Newest activity first, one page: enough to find a note without walking a long history. */
export async function fetchRecentNotes(client: GitlabClient, mr: MergeRequestRef): Promise<GitlabNoteJson[]> {
  return (await client.request(`${mergeRequestPath(mr)}/notes?order_by=updated_at&sort=desc&per_page=100`)).json()
}

/** A comment on the merge request as a whole. */
export async function createNote(client: GitlabClient, mr: MergeRequestRef, body: string): Promise<GitlabNoteJson> {
  return (await client.request(`${mergeRequestPath(mr)}/notes`, { method: 'POST', body: { body } })).json()
}

export async function updateNote(client: GitlabClient, mr: MergeRequestRef, noteId: number, body: string): Promise<GitlabNoteJson> {
  return (await client.request(`${mergeRequestPath(mr)}/notes/${noteId}`, { method: 'PUT', body: { body } })).json()
}

export async function deleteNote(client: GitlabClient, mr: MergeRequestRef, noteId: number): Promise<void> {
  await client.request(`${mergeRequestPath(mr)}/notes/${noteId}`, { method: 'DELETE' })
}

/** GitLab answers 401 to a valid token whose user may not approve this merge request. */
export async function approve(client: GitlabClient, mr: MergeRequestRef): Promise<void> {
  try {
    await client.request(`${mergeRequestPath(mr)}/approve`, { method: 'POST' })
  }
  catch (err) {
    throw err instanceof GitlabApiError && err.status === 401 ? diagnostics.approvalRefused() : err
  }
}

export async function unapprove(client: GitlabClient, mr: MergeRequestRef): Promise<void> {
  await client.request(`${mergeRequestPath(mr)}/unapprove`, { method: 'POST' })
}
