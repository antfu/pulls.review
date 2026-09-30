import * as v from 'valibot'
import { CommentAuthorSchema } from './comment-threads'

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
  url: v.string(), // html permalink on github.com
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
