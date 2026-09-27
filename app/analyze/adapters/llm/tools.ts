import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Tool } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'
import type { DiffsPayload } from '../../../types/diff'
import type { Analysis } from './schema'
import { toJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'
import { renderFilesAsText } from './prompt'
import { AnalysisSchema } from './schema'

export const READ_CALL_CHAR_CAP = 40_000

export interface AnalysisLedger {
  turn: number
  charsRead: number
  readPaths: Set<string>
  submitAttempts: number
  result?: Analysis
}

export function createLedger(): AnalysisLedger {
  return { turn: 0, charsRead: 0, readPaths: new Set(), submitAttempts: 0 }
}

export interface CoverageIssues {
  missing: string[]
  duplicated: string[]
  unknown: string[]
}

export function findCoverageIssues(diff: DiffsPayload, analysis: Analysis): CoverageIssues {
  const knownPaths = new Set(diff.files.map(file => file.path))
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  const unknown: string[] = []

  const visit = (path: string) => {
    if (!knownPaths.has(path)) {
      unknown.push(path)
      return
    }
    if (seen.has(path))
      duplicated.add(path)
    seen.add(path)
  }

  for (const group of analysis.groups) {
    group.filePaths.forEach(visit)
    for (const child of group.children ?? [])
      child.filePaths.forEach(visit)
  }

  const missing = diff.files.map(file => file.path).filter(path => !seen.has(path))
  return { missing, duplicated: [...duplicated], unknown }
}

function describeCoverageIssues(issues: CoverageIssues, toolName: string): string | undefined {
  const lines: string[] = []
  if (issues.missing.length > 0)
    lines.push(`Missing paths: ${issues.missing.join(', ')}`)
  if (issues.duplicated.length > 0)
    lines.push(`Duplicated paths: ${issues.duplicated.join(', ')}`)
  if (issues.unknown.length > 0)
    lines.push(`Unknown paths: ${issues.unknown.join(', ')}`)
  if (lines.length === 0)
    return undefined
  lines.push(`Fix these and call ${toolName} again.`)
  return lines.join('\n')
}

const ReadDiffsParamsSchema = v.object({
  paths: v.array(v.string()),
})

export function createReadDiffsTool(diff: DiffsPayload, ledger: AnalysisLedger): AgentTool {
  const filesByPath = new Map(diff.files.map(file => [file.path, file]))

  return {
    name: 'read_diffs',
    label: 'Read diffs',
    description: 'Returns the diffs of the given manifest paths.',
    parameters: toJsonSchema(ReadDiffsParamsSchema) as TSchema,
    execute: async (_toolCallId, rawParams) => {
      const parsed = v.safeParse(ReadDiffsParamsSchema, rawParams)
      if (!parsed.success)
        throw new Error(v.summarize(parsed.issues))
      const { paths } = parsed.output

      const unknownPaths = paths.filter(path => !filesByPath.has(path))
      if (unknownPaths.length > 0)
        throw new Error(`Unknown paths: ${unknownPaths.join(', ')}`)

      const sections: string[] = []
      const returnedPaths: string[] = []
      let chars = 0

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i]!
        if (ledger.readPaths.has(path)) {
          const text = `### ${path}\n(already shown above)`
          sections.push(text)
          returnedPaths.push(path)
          chars += text.length
          continue
        }

        let text = renderFilesAsText([filesByPath.get(path)!])

        if (chars + text.length > READ_CALL_CHAR_CAP && returnedPaths.length > 0) {
          sections.push(`Not returned (limit reached), request again: ${paths.slice(i).join(', ')}`)
          break
        }

        if (text.length > READ_CALL_CHAR_CAP)
          text = `${text.slice(0, READ_CALL_CHAR_CAP)}\n(truncated)`

        sections.push(text)
        returnedPaths.push(path)
        chars += text.length
      }

      for (const path of returnedPaths)
        ledger.readPaths.add(path)
      ledger.charsRead += chars

      return {
        content: [{ type: 'text', text: sections.join('\n\n') }],
        details: { paths: returnedPaths, chars },
      }
    },
  }
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function normalizeGroupArguments(value: unknown): unknown {
  const group = parseJsonString(value)
  if (!group || typeof group !== 'object' || Array.isArray(group))
    return group
  const record = group as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...record, filePaths: parseJsonString(record.filePaths) }
  if (record.children !== undefined) {
    const children = parseJsonString(record.children)
    normalized.children = Array.isArray(children) ? children.map(normalizeGroupArguments) : children
  }
  return normalized
}

/**
 * Some models behind Anthropic-compatible endpoints (e.g. DeepSeek via the Vercel AI Gateway)
 * emit nested arrays as JSON strings; pi validates arguments before execute, so undo that first.
 */
export function prepareGroupingArguments(args: unknown): unknown {
  if (!args || typeof args !== 'object')
    return args
  const record = args as Record<string, unknown>
  const groups = parseJsonString(record.groups)
  return { ...record, groups: Array.isArray(groups) ? groups.map(normalizeGroupArguments) : groups }
}

export function createSubmitGroupingTool(diff: DiffsPayload, ledger: AnalysisLedger): AgentTool {
  return {
    name: 'submit_grouping',
    label: 'Submit grouping',
    description: 'Submit the final grouping and overall summary.',
    parameters: toJsonSchema(AnalysisSchema) as TSchema,
    prepareArguments: prepareGroupingArguments,
    execute: async (_toolCallId, rawParams) => {
      ledger.submitAttempts += 1

      const parsed = v.safeParse(AnalysisSchema, rawParams)
      if (!parsed.success)
        throw new Error(v.summarize(parsed.issues))
      const analysis = parsed.output

      const message = describeCoverageIssues(findCoverageIssues(diff, analysis), 'submit_grouping')
      if (message && ledger.submitAttempts < 2)
        throw new Error(message)

      ledger.result = analysis
      return {
        content: [{ type: 'text', text: 'Grouping accepted.' }],
        details: analysis,
        terminate: true,
      }
    },
  }
}

export const UPDATE_GROUPING_DECLARATION: Tool = {
  name: 'update_grouping',
  description: 'Replace the current grouping and overall summary. Call only when the user asks to change the grouping.',
  parameters: toJsonSchema(AnalysisSchema) as TSchema,
}

export function createUpdateGroupingTool(diff: DiffsPayload, onUpdate: (analysis: Analysis) => void | Promise<void>): AgentTool {
  return {
    ...UPDATE_GROUPING_DECLARATION,
    label: 'Update grouping',
    prepareArguments: prepareGroupingArguments,
    execute: async (_toolCallId, rawParams) => {
      const parsed = v.safeParse(AnalysisSchema, rawParams)
      if (!parsed.success)
        throw new Error(v.summarize(parsed.issues))
      const analysis = parsed.output

      const message = describeCoverageIssues(findCoverageIssues(diff, analysis), 'update_grouping')
      if (message)
        throw new Error(message)

      await onUpdate(analysis)
      return {
        content: [{ type: 'text', text: `Grouping updated: ${analysis.groups.length} groups.` }],
        details: analysis,
      }
    },
  }
}
