import * as v from 'valibot'
import { GroupedResultSchema } from './analyze'

/** The JSON payload of a shared-analysis PR comment (see plans/07-share-result.md). */
export const SharedAnalysisSchema = v.object({
  headSha: v.string(),
  result: GroupedResultSchema,
})
export type SharedAnalysis = v.InferOutput<typeof SharedAnalysisSchema>

/** Validate an untrusted shared-analysis payload; `undefined` when malformed. */
export function parseSharedAnalysis(value: unknown): SharedAnalysis | undefined {
  const parsed = v.safeParse(SharedAnalysisSchema, value)
  return parsed.success ? parsed.output : undefined
}

/** One user's shared analysis, as found on the diff's comments. */
export interface SharedAnalysisComment {
  id: number
  login: string
  url: string
  updatedAt: string
  analysis: SharedAnalysis
}
