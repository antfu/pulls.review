import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LlmAnalyzeOptions } from '@pulls.review/core/llm'
import type { AnalyzeAdapter, DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import { resolveModel } from '@pulls.review/core/analyze'
import { diagnostics } from '@pulls.review/core/diagnostics'
import { settings } from '../../../state/settings'

export const NOT_COMPILED_MESSAGE = 'llm adapter is not compiled into this build (PR_LLM is off)'

/** Core's `runLlmAnalysis`, bound to the model and language in Settings. */
export async function runLlmAnalysis(diff: DiffsPayload, options?: LlmAnalyzeOptions): Promise<{ result: GroupedResult, transcript: AgentMessage[] }> {
  // The flag is a compile-time literal: with it off, the branch holding the `import()`
  // is eliminated, so the embed bundle never discovers the pi runtime.
  if (!import.meta.env.PR_LLM)
    throw new Error(NOT_COMPILED_MESSAGE)
  const resolved = resolveModel(settings.value.llm)
  if (!resolved)
    throw diagnostics.llmNotConfigured()

  // Read once per run so a mid-run settings change can't split the prompt and the stamp.
  const locale = settings.value.locale
  const { runLlmAnalysis } = await import('@pulls.review/core/llm')
  return runLlmAnalysis(diff, resolved, locale, options)
}

export const llmAdapter: AnalyzeAdapter = {
  id: 'llm',
  get available() {
    return import.meta.env.PR_LLM && resolveModel(settings.value.llm) !== undefined
  },
  async analyze(diff, options) {
    return (await runLlmAnalysis(diff, options)).result
  },
}
