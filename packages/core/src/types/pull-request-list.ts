import type { SourceRef } from './source'
import * as v from 'valibot'
import { CommentAuthorSchema } from './comment-threads'

/** Identifies what a pull request list belongs to, on whichever host. */
export const RepositoryRefSchema = v.variant('kind', [
  v.object({ kind: v.literal('github-repo'), owner: v.string(), repo: v.string() }),
  /** `project` is the full path with every namespace, as on a `gitlab-mr` ref. */
  v.object({ kind: v.literal('gitlab-project'), host: v.string(), project: v.string() }),
])
export type RepositoryRef = v.InferOutput<typeof RepositoryRefSchema>

/** A GitHub repository keeps the bare `owner/repo` form; it holds no `:`, so the GitLab form never equals one. */
export function serializeRepositoryRef(ref: RepositoryRef): string {
  return ref.kind === 'github-repo' ? `${ref.owner}/${ref.repo}` : `gitlab:${ref.host}/${ref.project}`
}

/** The ref of one of a repository's pull requests. */
export function pullRequestRef(repository: RepositoryRef, number: number): Extract<SourceRef, { kind: 'github-pr' | 'gitlab-mr' }> {
  return repository.kind === 'github-repo'
    ? { kind: 'github-pr', owner: repository.owner, repo: repository.repo, number: String(number) }
    : { kind: 'gitlab-mr', host: repository.host, project: repository.project, iid: String(number) }
}

/** The repository a pull request's ref belongs to and its number there; `undefined` for any other diff. */
export function pullRequestOf(ref: SourceRef): { repository: RepositoryRef, number: number } | undefined {
  if (ref.kind === 'github-pr')
    return { repository: { kind: 'github-repo', owner: ref.owner, repo: ref.repo }, number: Number(ref.number) }
  if (ref.kind === 'gitlab-mr')
    return { repository: { kind: 'gitlab-project', host: ref.host, project: ref.project }, number: Number(ref.iid) }
}

/**
 * One row of a repository's open pull requests, the schema-first counterpart to
 * `DiffsPayload` for the list view. Everything GitHub's own pulls page shows per
 * row lives here; the fields that only GraphQL exposes (`reviewDecision`,
 * `checks`, `linkedIssues`, the diff size) are optional because the anonymous
 * REST path can't supply them.
 */

export const PullRequestLabelSchema = v.object({
  name: v.string(),
  color: v.string(), // hex without `#`, as GitHub returns it
  description: v.optional(v.string()),
})
export type PullRequestLabel = v.InferOutput<typeof PullRequestLabelSchema>

export const ReviewDecisionSchema = v.picklist(['approved', 'changes_requested', 'review_required'])
export type ReviewDecision = v.InferOutput<typeof ReviewDecisionSchema>

export const ChecksStatusSchema = v.picklist(['success', 'failure', 'pending'])
export type ChecksStatus = v.InferOutput<typeof ChecksStatusSchema>

export const PullRequestListItemSchema = v.object({
  number: v.number(),
  title: v.string(),
  url: v.string(), // html permalink on the host
  state: v.picklist(['open', 'draft']),
  author: v.optional(CommentAuthorSchema), // absent for deleted ("ghost") accounts
  labels: v.array(PullRequestLabelSchema),
  assignees: v.array(CommentAuthorSchema),
  milestone: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  comments: v.number(),
  reviewDecision: v.optional(ReviewDecisionSchema),
  checks: v.optional(ChecksStatusSchema),
  linkedIssues: v.optional(v.number()),
  additions: v.optional(v.number()),
  deletions: v.optional(v.number()),
  changedFiles: v.optional(v.number()),
})
export type PullRequestListItem = v.InferOutput<typeof PullRequestListItemSchema>

export const PullRequestListPageSchema = v.object({
  totalCount: v.number(),
  items: v.array(PullRequestListItemSchema),
  /** Opaque continuation for the next page; absent when this was the last one. */
  next: v.optional(v.string()),
})
export type PullRequestListPage = v.InferOutput<typeof PullRequestListPageSchema>
