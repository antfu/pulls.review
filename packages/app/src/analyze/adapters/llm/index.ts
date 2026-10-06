import type { AnalyzeAdapter } from '@pulls.review/core/types'
import { browserLlmRunner } from '../../browser-llm-runner'

/** The registry's `llm` entry: the in-browser runner. Stores run analysis through their context's `LlmRunner` instead. */
export const llmAdapter: AnalyzeAdapter = {
  id: 'llm',
  get available() {
    return browserLlmRunner.isSetup()
  },
  async analyze(diff, options) {
    return (await browserLlmRunner.analyze(diff, options ?? {})).result
  },
}
