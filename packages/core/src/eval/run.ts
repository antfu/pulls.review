import type { GroupedResult } from '../types/analyze'
import type { DiffsPayload } from '../types/diff'
import type { EvalCase } from './corpus'
import type { GroupingScore } from './score'
import { scoreGrouping } from './score'

export interface EvalCaseResult {
  name: string
  score: GroupingScore
  durationMs: number
}

export interface EvalReport {
  cases: EvalCaseResult[]
  average: GroupingScore
}

function averageScore(cases: EvalCaseResult[]): GroupingScore {
  const mean = (pick: (score: GroupingScore) => number) =>
    cases.length === 0 ? 0 : cases.reduce((sum, entry) => sum + pick(entry.score), 0) / cases.length
  return {
    pairwisePrecision: mean(score => score.pairwisePrecision),
    pairwiseRecall: mean(score => score.pairwiseRecall),
    pairwiseF1: mean(score => score.pairwiseF1),
    criticalFileRecall: mean(score => score.criticalFileRecall),
  }
}

/** Run one analyzer over the corpus and score every case against its golden grouping. */
export async function runEval(
  cases: EvalCase[],
  analyze: (diff: DiffsPayload) => Promise<GroupedResult>,
): Promise<EvalReport> {
  const results: EvalCaseResult[] = []
  for (const evalCase of cases) {
    const startedAt = Date.now()
    const actual = await analyze(evalCase.diff)
    results.push({ name: evalCase.name, score: scoreGrouping(evalCase.expected, actual), durationMs: Date.now() - startedAt })
  }
  return { cases: results, average: averageScore(results) }
}
