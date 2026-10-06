import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Locale } from '../../../locales'
import type { DiffGroup, FileNote, GroupedResult, GroupedResultCore, LineNote } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { LlmAnalyzeOptions } from './agent'
import type { ResolvedModel } from './model'
import type { Analysis } from './schema'
import { normalizeGroupedResult } from '../../../types/analyze'
import { runAgent } from './agent'

export const LLM_SCHEMA_VERSION = 1

/** Notes only make sense on a file the group actually holds. */
function keepOwnNotes<T extends { filePaths: string[], fileNotes?: FileNote[], lineNotes?: LineNote[] }>(group: T): T {
  const fileNotes = group.fileNotes?.filter(note => group.filePaths.includes(note.path))
  const lineNotes = group.lineNotes?.filter(note => group.filePaths.includes(note.path))
  return { ...group, fileNotes: fileNotes?.length ? fileNotes : undefined, lineNotes: lineNotes?.length ? lineNotes : undefined }
}

/**
 * Drops any file path the model hallucinated (not in the diff) and any it duplicated
 * across groups (first group wins), along with notes on paths the group lost. Files
 * the model left out are not re-attached here: `resolveGroups` surfaces them as
 * "Uncategorized" at view time, the same way it handles files added by later commits.
 */
function reconcile(diff: DiffsPayload, analysis: Analysis): DiffGroup[] {
  const validPaths = new Set(diff.files.map(file => file.path))
  const seen = new Set<string>()
  const groups: DiffGroup[] = []

  for (const group of analysis.groups) {
    const filePaths = group.filePaths.filter(path => validPaths.has(path) && !seen.has(path))
    filePaths.forEach(path => seen.add(path))

    const children = group.children
      ?.map(child => keepOwnNotes({
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
    groups.push(keepOwnNotes({ ...group, filePaths, children: children?.length ? children : undefined }))
  }

  return groups
}

/** `model` is the `provider/model-id` stamp, so a result from a local agent CLI needs no `ResolvedModel`. */
export function toGroupedResult(diff: DiffsPayload, analysis: Analysis, model: string, locale: Locale): GroupedResult {
  const core: GroupedResultCore = {
    overallSummary: analysis.overallSummary,
    groups: reconcile(diff, analysis),
    schemaVersion: LLM_SCHEMA_VERSION,
  }
  return { ...normalizeGroupedResult('llm', core, model), locale }
}

export function modelStamp(resolved: ResolvedModel): string {
  return `${resolved.model.provider}/${resolved.model.id}`
}

/** `locale` is both the language the summaries are written in and the stamp on the result. */
export async function runLlmAnalysis(diff: DiffsPayload, resolved: ResolvedModel, locale: Locale, options?: LlmAnalyzeOptions): Promise<{ result: GroupedResult, transcript: AgentMessage[] }> {
  const { analysis, transcript } = await runAgent(diff, resolved, locale, options)
  return { result: toGroupedResult(diff, analysis, modelStamp(resolved), locale), transcript }
}
