import type { AnalyzeAdapter, GroupSource } from '@pulls.review/core/types'
import { createNoneAdapter, createRuleBasedAdapter } from '@pulls.review/core/analyze'
import { t } from '../i18n'
import { llmAdapter } from './adapters/llm'
import { webLlmAdapter } from './adapters/web-llm'

/** Group text is looked up per run, so it follows the current UI language. */
export const ruleBasedAdapter = createRuleBasedAdapter(key => ({ label: t(`rules.${key}.label`), summary: t(`rules.${key}.summary`) }))
export const noneAdapter = createNoneAdapter(() => t('rules.allFiles'))

const registry: Record<GroupSource, AnalyzeAdapter> = {
  'none': noneAdapter,
  'rule-based': ruleBasedAdapter,
  'llm': llmAdapter,
  'web-llm': webLlmAdapter,
}

export function resolveAdapter(id: GroupSource): AnalyzeAdapter {
  return registry[id]
}
