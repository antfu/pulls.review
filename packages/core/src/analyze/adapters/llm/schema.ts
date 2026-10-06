import type { JsonSchema } from '@valibot/to-json-schema'
import { toJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'
import { SubmittedGroupLeafSchema, withChildren } from '../../../types/analyze'

/**
 * Shape the model submits via `submit_grouping`: everything
 * `GroupedResult` needs except the fields the adapter itself owns (`source`,
 * `schemaVersion`, `generatedAt`).
 */
export const AnalysisSchema = v.object({
  overallSummary: v.pipe(v.string(), v.description('A short summary of the intention of the PR (why over what) for a reviewer who hasn\'t read it yet. Rendered as Markdown.')),
  groups: v.array(withChildren(SubmittedGroupLeafSchema)),
})
export type Analysis = v.InferOutput<typeof AnalysisSchema>

/** The same shape as JSON Schema, for an agent CLI that validates or is told its final answer. */
export function analysisJsonSchema(): JsonSchema {
  return toJsonSchema(AnalysisSchema)
}
