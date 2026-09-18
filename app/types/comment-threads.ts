import * as v from 'valibot'

/**
 * Review-comment threads and review summaries for a GitHub PR, in the same
 * valibot-schema-first style as `diff.ts`. Sides use pierre's vocabulary
 * (`additions`/`deletions`) rather than GitHub's `RIGHT`/`LEFT` so the view
 * layer never translates; the github provider maps at the boundary.
 */

export const DiffSideSchema = v.picklist(['additions', 'deletions'])
export type DiffSide = v.InferOutput<typeof DiffSideSchema>

export const CommentAuthorSchema = v.object({
  login: v.string(),
  avatarUrl: v.optional(v.string()),
})
export type CommentAuthor = v.InferOutput<typeof CommentAuthorSchema>

export const ReviewCommentSchema = v.object({
  id: v.number(),
  author: v.optional(CommentAuthorSchema), // absent for deleted ("ghost") accounts
  body: v.string(), // raw GitHub-flavored markdown, rendered client-side
  createdAt: v.string(),
  url: v.optional(v.string()), // html permalink
  /** Part of the viewer's own pending (unsubmitted) review - only ever true for the token's user. */
  pending: v.boolean(),
})
export type ReviewComment = v.InferOutput<typeof ReviewCommentSchema>

export const CommentThreadSchema = v.object({
  /** Id of the root comment - stable thread identity, and the reply target. */
  rootId: v.number(),
  path: v.string(),
  side: DiffSideSchema,
  /** Anchor line in the current diff; absent when the thread is outdated (anchor line no longer exists). */
  line: v.optional(v.number()),
  startLine: v.optional(v.number()), // multi-line comments: first line of the range
  startSide: v.optional(DiffSideSchema),
  outdated: v.boolean(),
  /** `undefined` = unknown (resolution only exists in GitHub's GraphQL API, which needs a token). */
  resolved: v.optional(v.boolean()),
  /** GraphQL thread node id, required by the resolve mutation - present only when resolution data loaded. */
  threadId: v.optional(v.string()),
  pending: v.boolean(),
  comments: v.array(ReviewCommentSchema),
})
export type CommentThread = v.InferOutput<typeof CommentThreadSchema>

export const ReviewSummaryStateSchema = v.picklist(['approved', 'changes_requested', 'commented', 'dismissed'])
export type ReviewSummaryState = v.InferOutput<typeof ReviewSummaryStateSchema>

/** A submitted review event (the Approve/Request-changes verdict with its optional body). */
export const ReviewSummarySchema = v.object({
  id: v.number(),
  author: v.optional(CommentAuthorSchema),
  state: ReviewSummaryStateSchema,
  body: v.string(),
  submittedAt: v.optional(v.string()),
  url: v.optional(v.string()),
})
export type ReviewSummary = v.InferOutput<typeof ReviewSummarySchema>

/** The viewer's unsubmitted review. `nodeId` is needed to add threads to it via GraphQL. */
export const PendingReviewSchema = v.object({
  id: v.number(),
  nodeId: v.string(),
  body: v.string(),
})
export type PendingReview = v.InferOutput<typeof PendingReviewSchema>

export const ReviewDataSchema = v.object({
  threads: v.array(CommentThreadSchema),
  summaries: v.array(ReviewSummarySchema),
  pendingReview: v.optional(PendingReviewSchema),
})
export type ReviewData = v.InferOutput<typeof ReviewDataSchema>

/** Where a new thread anchors: the line (or range) the composer was opened on. */
export interface ReviewDraftTarget {
  path: string
  side: DiffSide
  line: number
  startLine?: number
  startSide?: DiffSide
}

export type ReviewVerdict = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
