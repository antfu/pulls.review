import type { AgentMessage } from '@earendil-works/pi-agent-core'
import * as v from 'valibot'
import { AgentSessionRefSchema, GroupedResultSchema } from '../types/analyze'
import { ReviewDataSchema } from '../types/comment-threads'
import { DiffsPayloadSchema, PullRequestStateSchema } from '../types/diff'
import { PullRequestListPageSchema } from '../types/pull-request-list'
import { SourceRefSchema } from '../types/source'

/**
 * Only results that cost something to produce (a model call) are persisted. The
 * cheap, deterministic adapters (`rule-based`, `none`) are recomputed from the diff
 * on every load so they can never go stale against it.
 */
export const PersistedAnalysesSchema = v.object({
  'llm': v.optional(GroupedResultSchema),
  'web-llm': v.optional(GroupedResultSchema),
})
export type PersistedAnalyses = v.InferOutput<typeof PersistedAnalysesSchema>
export type PersistedGroupSource = keyof PersistedAnalyses

const LlmSessionSchema = v.object({
  messages: v.array(v.looseObject({ role: v.string() })),
  chatStartIndex: v.number(),
  agent: v.optional(AgentSessionRefSchema),
})

/** `agent` names the local agent CLI session the chat continues in (`plans/11-local-agents.md`). */
export interface LlmSession { messages: AgentMessage[], chatStartIndex: number, agent?: v.InferOutput<typeof AgentSessionRefSchema> }

/**
 * The small, often-rewritten half of a cached diff: everything eviction, the recent
 * lists and per-view bookkeeping need, so none of them ever reads a whole diff.
 */
export const PrCacheMetaSchema = v.object({
  key: v.string(),
  ref: SourceRefSchema,
  headSha: v.string(),
  title: v.string(),
  label: v.optional(v.string()),
  url: v.optional(v.string()),
  pullRequestState: v.optional(PullRequestStateSchema),
  additions: v.number(),
  deletions: v.number(),
  /** Every file's `sha`, for review-mark counts and pruning orphaned marks. */
  fileShas: v.array(v.string()),
  lastViewedAt: v.number(), // for LRU
  sizeBytes: v.number(), // approx, for budget accounting
  /** The viewer's own shared-analysis PR comment, reused (PATCHed) on later shares. */
  sharedComment: v.optional(v.object({ id: v.number(), url: v.string() })),
  /**
   * Paths whose reviewed `sha` was replaced by a refetch (see `putDiff`): the file was
   * reviewed, then changed in later commits. Cleared per path when it's marked again.
   */
  changedSinceReviewed: v.optional(v.array(v.string())),
})
export type PrCacheMeta = v.InferOutput<typeof PrCacheMetaSchema>

/** The large half: the diff itself and what was paid for against it. */
export const PrCacheBodySchema = v.object({
  diff: DiffsPayloadSchema, // raw normalized diff at headSha
  analyzedBy: PersistedAnalysesSchema,
  reviews: v.optional(ReviewDataSchema), // stale-while-revalidate snapshot of review threads/summaries; always refetched on view
  llmSession: v.optional(LlmSessionSchema),
})
export type PrCacheBody = v.InferOutput<typeof PrCacheBodySchema>

/** One cached diff as callers see it; stored as a `PrCacheMeta` plus a `PrCacheBody`. */
export type PrCacheEntry = Pick<PrCacheMeta, 'key' | 'headSha' | 'lastViewedAt' | 'sizeBytes' | 'sharedComment' | 'changedSinceReviewed'> & PrCacheBody

/**
 * Per-file "reviewed" mark, keyed by the file's `sha` (see FileChangeSchema) rather
 * than by path or PR, so if a PR gets new commits and a given file's `sha` is
 * unchanged, its reviewed mark survives; only files whose `sha` actually changed
 * lose their mark. Also lets review state outlive any single cached PR entry: the
 * same file content reviewed in one PR context still registers as reviewed if
 * referenced again (e.g. a rebase, or the same file touched in a later PR).
 */
export const FileReviewStateSchema = v.object({
  sha: v.string(), // primary key, same sha as FileChange.sha
  reviewedAt: v.number(), // epoch ms
})
export type FileReviewState = v.InferOutput<typeof FileReviewStateSchema>

/**
 * Only a repo's first page is persisted: it's what renders instantly on revisit
 * while the fresh copy loads, and later pages chain off it through `next`.
 * Persisting more would either shrink the list on refresh or need a page-by-page
 * revalidation nobody asked for. `lastViewedAt` doubles as the home page's
 * "recent repositories" order and the LRU eviction key.
 */
export const PullRequestListCacheEntrySchema = v.object({
  owner: v.string(),
  repo: v.string(),
  page: PullRequestListPageSchema,
  lastViewedAt: v.number(),
})
export type PullRequestListCacheEntry = v.InferOutput<typeof PullRequestListCacheEntrySchema>
