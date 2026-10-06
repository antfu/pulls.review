import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentStreamEvent } from '@pulls.review/core/local-rpc'
import type { Locale } from '@pulls.review/core/locales'
import type { AgentSessionRef, AnalyzeProgress, DiffsPayload } from '@pulls.review/core/types'
import type { AgentCli, AgentCliEvent, AgentRunInput } from './types'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { analysisJsonSchema, buildCliAgentSystemPrompt, renderFilesAsText } from '@pulls.review/core/llm'
import { AGENT_SESSION_LOST } from '@pulls.review/core/local-rpc'

export { toolResultMessage } from './types'

/** A run with no event for this long is given up as failed. */
export const AGENT_IDLE_TIMEOUT_MS = 5 * 60_000

export interface AgentRunOptions {
  cli: AgentCli
  model?: string
  diff: DiffsPayload
  locale: Locale
  /** The repository for a local diff - the agent may open its files - or a scratch dir for a GitHub one. */
  cwd: string
  repository: boolean
  /** Where the patch is written for the agent to read. */
  patchDir: string
  emit: (event: AgentStreamEvent) => void
  signal: AbortSignal
}

export class AgentRunError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

/** The system prompt an agent gets: the role, the patch's location, and - without a schema flag - the answer's shape. */
export function systemPromptFor(cli: AgentCli, patchPath: string, repository: boolean, extra = ''): string {
  const base = buildCliAgentSystemPrompt({ patchPath, repository })
  const schema = cli.structuredOutput
    ? ''
    : `\n\n<schema>\nThe grouping JSON must match this JSON Schema:\n${JSON.stringify(analysisJsonSchema())}\n</schema>`
  return `${base}${extra}${schema}`
}

/** The files an agent's tool call touches, for the "reading" progress line. */
export function pathsOf(message: AgentMessage, cwd: string): string[] {
  if (message.role !== 'assistant')
    return []
  const paths: string[] = []
  for (const part of message.content) {
    if (part.type !== 'toolCall')
      continue
    const args = part.arguments
    const value = args.file_path ?? args.filePath ?? args.path ?? args.pattern ?? args.command
    if (typeof value !== 'string' || !value)
      continue
    const rel = relative(cwd, value)
    paths.push(value.startsWith('/') && rel && !rel.startsWith('..') ? rel : value)
  }
  return paths
}

export interface TurnOutcome {
  session?: AgentSessionRef
  final?: { text?: string, structured?: unknown }
}

/**
 * One subprocess of the agent: appends its messages to `transcript` (emitting the live
 * transcript and progress as it goes) and resolves with its final answer. Rejects with
 * `AgentRunError` when the CLI fails, loses the session, or goes quiet too long.
 */
export async function runTurn(cli: AgentCli, input: Omit<AgentRunInput, 'signal'>, transcript: AgentMessage[], { emit, signal, cwd, model, step }: Pick<AgentRunOptions, 'emit' | 'signal' | 'cwd' | 'model'> & { step: number }): Promise<TurnOutcome> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort)
  let idle = setTimeout(abort, AGENT_IDLE_TIMEOUT_MS)
  const progress = (next: AnalyzeProgress) => emit({ kind: 'progress', progress: next })

  const outcome: TurnOutcome = {}
  let failure: string | undefined

  const onMessage = (message: AgentMessage) => {
    transcript.push(message)
    emit({ kind: 'messages', messages: [...transcript] })
    const paths = pathsOf(message, cwd)
    if (paths.length)
      progress({ step, kind: 'reading', paths })
    else if (message.role === 'assistant')
      progress({ step, kind: 'thinking' })
  }

  const onExit = (exit: Extract<AgentCliEvent, { kind: 'exit' }>) => {
    if (signal.aborted)
      throw new AgentRunError('Aborted', 'aborted')
    if (controller.signal.aborted)
      throw new AgentRunError(`${cli.label} produced no output for ${AGENT_IDLE_TIMEOUT_MS / 60_000} minutes.`)
    if (exit.sessionLost)
      throw new AgentRunError(`${cli.label} no longer has this conversation.`, AGENT_SESSION_LOST)
    if (failure !== undefined || (exit.code !== 0 && !outcome.final))
      throw new AgentRunError(failure || exit.stderr || `${cli.label} exited with code ${exit.code}.`)
  }

  try {
    progress({ step, kind: 'thinking' })
    for await (const event of cli.run({ ...input, signal: controller.signal })) {
      clearTimeout(idle)
      idle = setTimeout(abort, AGENT_IDLE_TIMEOUT_MS)
      switch (event.kind) {
        case 'session':
          outcome.session = { agent: cli.name, id: event.id, model: event.model ?? model }
          emit({ kind: 'session', session: outcome.session })
          break
        case 'message':
          onMessage(event.message)
          break
        case 'final':
          if (event.isError)
            failure = event.text ?? ''
          else
            outcome.final = { text: event.text, structured: event.structured }
          break
        case 'exit':
          onExit(event)
      }
    }
  }
  finally {
    clearTimeout(idle)
    signal.removeEventListener('abort', abort)
  }
  return outcome
}

/** Writes the patch the agent reads; resolves with its path and a cleanup. */
export async function writePatch(patchDir: string, id: string, diff: DiffsPayload): Promise<{ patchPath: string, cleanup: () => Promise<void> }> {
  await mkdir(patchDir, { recursive: true })
  const patchPath = join(patchDir, `${id}.patch`)
  await writeFile(patchPath, renderFilesAsText(diff.files))
  return { patchPath, cleanup: () => rm(patchPath, { force: true }) }
}

/** The last fenced ```json block in an answer, parsed; else the whole text when it is JSON. */
export function parseJsonAnswer(text: string | undefined): unknown {
  if (!text)
    return undefined
  const fences = [...text.matchAll(/```(?:json)?\n([\s\S]*?)\n```/g)]
  const candidate = fences.at(-1)?.[1] ?? text
  try {
    return JSON.parse(candidate)
  }
  catch {
    return undefined
  }
}
