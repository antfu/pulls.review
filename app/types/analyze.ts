import type { DiffsPayload } from './diff'
import * as v from 'valibot'

export const GroupSourceSchema = v.picklist([
  'none',
  'rule-based',
  'llm',
  'web-llm',
])
export type GroupSource = v.InferOutput<typeof GroupSourceSchema>

export const DiffCategorySchema = v.picklist([
  'code',
  'tests',
  'docs',
  'deps',
  'config',
  'generated',
  'other',
])
export type DiffCategory = v.InferOutput<typeof DiffCategorySchema>

/**
 * Leaf group shape (no further nesting), reused for both root groups and their children,
 * which structurally enforces the "max depth 2" decision rather than relying on convention.
 *
 * Field `description`s double as the llm adapter's field-level instructions - the model
 * sees them directly in the `submit_grouping` tool's parameter schema, so `prompt.ts` only
 * needs high-level framing, not a restatement of these per-field rules.
 */
export const DiffGroupLeafSchema = v.object({
  key: v.pipe(v.string(), v.description('Stable, short, kebab-case-ish id, e.g. "docs" or "feature-a".')),
  label: v.pipe(v.string(), v.description('Short, human-readable display name for this group.')),
  summary: v.optional(v.pipe(v.string(), v.description('Concise explanation of the intention of this group (why over what). Rendered as Markdown.'))), // populated only when an llm/web-llm adapter has run
  filePaths: v.pipe(v.array(v.string()), v.description('File paths belonging directly to this group (not to a child). Every file path given to you MUST end up in exactly one group or child - never both, never omitted.')), // references into DiffsPayload.files by path
})
export type DiffGroupLeaf = v.InferOutput<typeof DiffGroupLeafSchema>

export const DiffGroupSchema = v.object({
  ...DiffGroupLeafSchema.entries,
  children: v.optional(v.pipe(v.array(DiffGroupLeafSchema), v.description('One extra level of nesting, e.g. splitting a large group by sub-area. Children cannot have children of their own.'))), // depth capped at 2 total (root -> children)
})
export type DiffGroup = v.InferOutput<typeof DiffGroupSchema>

/**
 * What an adapter itself decides by analyzing the diff. `source` (which adapter ran)
 * and `generatedAt` (when) are invocation metadata the caller already knows - not
 * something the adapter decides - so they're stamped on separately to normalize this
 * into the full `GroupedResultSchema` below, instead of every adapter repeating them.
 */
export const GroupedResultCoreSchema = v.object({
  overallSummary: v.optional(v.pipe(v.string(), v.description('Short paragraph summarizing the whole PR for a reviewer, rendered as Markdown.'))), // only when an 'llm' or 'web-llm' adapter has run
  groups: v.array(DiffGroupSchema),
  schemaVersion: v.number(), // bump on breaking shape changes, used for cache invalidation
})
export type GroupedResultCore = v.InferOutput<typeof GroupedResultCoreSchema>

export const GroupedResultSchema = v.object({
  ...GroupedResultCoreSchema.entries,
  source: GroupSourceSchema,
  generatedAt: v.string(),
  /** `provider/model-id` that produced an llm/web-llm result. */
  model: v.optional(v.string()),
  /** Login of the user whose shared PR comment this result was loaded from (see plans/07). */
  sharedBy: v.optional(v.string()),
})
export type GroupedResult = v.InferOutput<typeof GroupedResultSchema>

/** Stamps the invocation metadata an adapter doesn't decide onto its analysis. */
export function normalizeGroupedResult(source: GroupSource, core: GroupedResultCore, model?: string): GroupedResult {
  return { ...core, source, generatedAt: new Date().toISOString(), model }
}

export interface AnalyzeProgress { step: number, message: string }
export interface AnalyzeOptions { onProgress?: (progress: AnalyzeProgress) => void, signal?: AbortSignal }

export interface AnalyzeAdapter {
  readonly id: GroupSource // 'none' | 'rule-based' | 'llm' | 'web-llm'
  readonly available: boolean // none/rule-based: always true; llm: true once a key is configured; web-llm: true once a local model is loaded
  analyze: (diff: DiffsPayload, options?: AnalyzeOptions) => Promise<GroupedResult>
}
