import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Analysis } from '@pulls.review/core/llm'
import type { DiffsPayload } from '@pulls.review/core/types'
import type { AgentRunOptions } from './run'
import { randomUUID } from 'node:crypto'
import { analysisJsonSchema, AnalysisSchema, buildAnalysisPrompt, describeCoverageIssues, findCoverageIssues, toGroupedResult } from '@pulls.review/core/llm'
import * as v from 'valibot'
import { AgentRunError, parseJsonAnswer, runTurn, systemPromptFor, writePatch } from './run'

const RETRY_FIX = 'Fix these and answer again with the complete grouping as JSON.'

/** The accepted grouping, or what to tell the agent to fix. */
export function checkAnswer(diff: DiffsPayload, answer: unknown): { analysis: Analysis } | { fix: string } {
  const parsed = v.safeParse(AnalysisSchema, answer)
  if (!parsed.success)
    return { fix: `The answer is not a valid grouping: ${v.summarize(parsed.issues)}\n${RETRY_FIX}` }
  const fix = describeCoverageIssues(findCoverageIssues(diff, parsed.output), RETRY_FIX)
  return fix ? { fix } : { analysis: parsed.output }
}

/**
 * Analyzes a diff through an agent CLI the way `runAgent` does through a model: the same
 * prompt, the patch on disk instead of `read_diffs`, a JSON answer instead of
 * `submit_grouping`, and one retry when the grouping misses or invents paths.
 */
export async function runAgentAnalysis({ cli, model, diff, locale, cwd, repository, patchDir, emit, signal }: AgentRunOptions): Promise<void> {
  const { patchPath, cleanup } = await writePatch(patchDir, randomUUID(), diff)
  try {
    const system = systemPromptFor(cli, patchPath, repository)
    const prompt = buildAnalysisPrompt(diff, locale)
    const transcript: AgentMessage[] = [
      { role: 'system', content: system, timestamp: Date.now() },
      { role: 'user', content: prompt, timestamp: Date.now() },
    ]
    emit({ kind: 'messages', messages: [...transcript] })
    const schema = cli.structuredOutput ? analysisJsonSchema() : undefined
    const turn = { emit, signal, cwd, model }

    let outcome = await runTurn(cli, { cwd, system, prompt, model, schema }, transcript, { ...turn, step: 1 })
    let answer = checkAnswer(diff, outcome.final?.structured ?? parseJsonAnswer(outcome.final?.text))
    if ('fix' in answer) {
      if (!outcome.session)
        throw new AgentRunError(answer.fix)
      transcript.push({ role: 'user', content: answer.fix, timestamp: Date.now() })
      const retry = await runTurn(cli, { cwd, system, prompt: answer.fix, model, schema, resume: outcome.session.id }, transcript, { ...turn, step: 2 })
      outcome = { session: retry.session ?? outcome.session, final: retry.final }
      answer = checkAnswer(diff, outcome.final?.structured ?? parseJsonAnswer(outcome.final?.text))
      if ('fix' in answer)
        throw new AgentRunError(answer.fix)
    }
    emit({ kind: 'progress', progress: { step: 2, kind: 'organizing' } })
    const stamp = `${cli.name}/${outcome.session?.model ?? model ?? 'default'}`
    emit({ kind: 'result', result: toGroupedResult(diff, answer.analysis, stamp, locale) })
    emit({ kind: 'end', stopReason: 'done' })
  }
  finally {
    await cleanup()
  }
}
