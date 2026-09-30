import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Locale } from '../../../i18n/locales'
import type { AnalyzeAdapter, DiffGroup, GroupedResult, GroupedResultCore } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { LlmAnalyzeOptions } from './agent'
import type { ResolvedModel } from './model'
import type { Analysis } from './schema'
import { settings } from '../../../state/settings'
import { normalizeGroupedResult } from '../../../types/analyze'
import { NOT_COMPILED_MESSAGE, notConfiguredError, resolveModel } from './model'

export const LLM_SCHEMA_VERSION = 1

/**
 * Drops any file path the model hallucinated (not in the diff) and any it duplicated
 * across groups (first group wins). Files the model left out are not re-attached
 * here: `resolveGroups` surfaces them as "Uncategorized" at view time, the same way
 * it handles files added by later commits.
 */
function reconcile(diff: DiffsPayload, analysis: Analysis): DiffGroup[] {
  const validPaths = new Set(diff.files.map(file => file.path))
  const seen = new Set<string>()
  const groups: DiffGroup[] = []

  for (const group of analysis.groups) {
    const filePaths = group.filePaths.filter(path => validPaths.has(path) && !seen.has(path))
    filePaths.forEach(path => seen.add(path))

    const children = group.children
      ?.map(child => ({
        ...child,
        filePaths: child.filePaths.filter((path) => {
          if (!validPaths.has(path) || seen.has(path))
            return false
          seen.add(path)
          return true
        }),
      }))
      .filter(child => child.filePaths.length > 0)

    if (filePaths.length === 0 && !children?.length)
      continue
    groups.push({ ...group, filePaths, children: children?.length ? children : undefined })
  }

  return groups
}

export function toGroupedResult(diff: DiffsPayload, analysis: Analysis, resolved: ResolvedModel, locale: Locale): GroupedResult {
  const core: GroupedResultCore = {
    overallSummary: analysis.overallSummary,
    groups: reconcile(diff, analysis),
    schemaVersion: LLM_SCHEMA_VERSION,
  }
  return { ...normalizeGroupedResult('llm', core, `${resolved.model.provider}/${resolved.model.id}`), locale }
}

export async function runLlmAnalysis(diff: DiffsPayload, options?: LlmAnalyzeOptions): Promise<{ result: GroupedResult, transcript: AgentMessage[] }> {
  // The flag is a compile-time literal: with it off, the branch holding the `import()`
  // is eliminated, so the embed bundle never discovers the pi runtime.
  if (!import.meta.env.PR_LLM)
    throw new Error(NOT_COMPILED_MESSAGE)
  const resolved = resolveModel()
  if (!resolved)
    throw notConfiguredError()

  // Read once per run so a mid-run settings change can't split the prompt and the stamp.
  const locale = settings.value.locale
  const { runAgent } = await import('./agent')
  const { analysis, transcript } = await runAgent(diff, resolved, locale, options)
  return { result: toGroupedResult(diff, analysis, resolved, locale), transcript }
}

export const llmAdapter: AnalyzeAdapter = {
  id: 'llm',
  get available() {
    return import.meta.env.PR_LLM && resolveModel() !== undefined
  },
  async analyze(diff, options) {
    return (await runLlmAnalysis(diff, options)).result
  },
}
