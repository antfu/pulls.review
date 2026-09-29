import type { AgentMessage } from '@earendil-works/pi-agent-core'
import * as v from 'valibot'
import { GroupedResultSchema } from './analyze'
import { ReviewDataSchema } from './comment-threads'
import { DiffsPayloadSchema } from './diff'

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

export const PrCacheEntrySchema = v.object({
  key: v.string(),
  diff: DiffsPayloadSchema, // raw normalized diff at headSha
  headSha: v.string(),
  analyzedBy: PersistedAnalysesSchema,
  reviews: v.optional(ReviewDataSchema), // stale-while-revalidate snapshot of review threads/summaries; always refetched on view
  lastViewedAt: v.number(), // for LRU
  sizeBytes: v.number(), // approx, for budget accounting
  llmSession: v.optional(v.object({
    messages: v.array(v.looseObject({ role: v.string() })),
    chatStartIndex: v.number(),
  })),
  /** The viewer's own shared-analysis PR comment, reused (PATCHed) on later shares. */
  sharedComment: v.optional(v.object({ id: v.number(), url: v.string() })),
})
export type PrCacheEntry = v.InferOutput<typeof PrCacheEntrySchema>

export interface LlmSession { messages: AgentMessage[], chatStartIndex: number }
