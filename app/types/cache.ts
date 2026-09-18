import type { AgentMessage } from '@earendil-works/pi-agent-core'
import * as v from 'valibot'
import { GroupedResultSchema, GroupSourceSchema } from './analyze'
import { ReviewDataSchema } from './comment-threads'
import { DiffsPayloadSchema } from './diff'

export const PrCacheEntrySchema = v.object({
  key: v.string(),
  diff: DiffsPayloadSchema, // raw normalized diff at headSha
  headSha: v.string(),
  analyzedBy: v.record(GroupSourceSchema, GroupedResultSchema), // keyed by adapter id; only 'rule-based' populated for now (a picklist-keyed record is naturally partial)
  reviews: v.optional(ReviewDataSchema), // stale-while-revalidate snapshot of review threads/summaries; always refetched on view
  lastViewedAt: v.number(), // for LRU
  sizeBytes: v.number(), // approx, for budget accounting
  llmSession: v.optional(v.object({
    messages: v.array(v.looseObject({ role: v.string() })),
    chatStartIndex: v.number(),
  })),
})
export type PrCacheEntry = v.InferOutput<typeof PrCacheEntrySchema>

export interface LlmSession { messages: AgentMessage[], chatStartIndex: number }
