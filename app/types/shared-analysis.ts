import * as v from 'valibot'
import { GroupedResultSchema } from './analyze'

/** The JSON payload of a shared-analysis PR comment (see plans/07-share-result.md). */
export const SharedAnalysisSchema = v.object({
  headSha: v.string(),
  result: GroupedResultSchema,
})
export type SharedAnalysis = v.InferOutput<typeof SharedAnalysisSchema>
