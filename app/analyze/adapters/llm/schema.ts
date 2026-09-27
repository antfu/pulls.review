import * as v from 'valibot'
import { DiffGroupSchema } from '../../../types/analyze'

/**
 * Shape the model submits via `submit_grouping`: everything
 * `GroupedResult` needs except the fields the adapter itself owns (`source`,
 * `schemaVersion`, `generatedAt`).
 */
export const AnalysisSchema = v.object({
  overallSummary: v.pipe(v.string(), v.description('A short summary of the intention of the PR (why over what) for a reviewer who hasn\'t read it yet. Rendered as Markdown.')),
  groups: v.array(DiffGroupSchema),
})
export type Analysis = v.InferOutput<typeof AnalysisSchema>
