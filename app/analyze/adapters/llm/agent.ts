import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Message } from '@earendil-works/pi-ai'
import type { AnalyzeOptions } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { ResolvedModel } from './model'
import type { Analysis } from './schema'
import { runAgentLoop } from '@earendil-works/pi-agent-core'
import { AGENT_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'
import { createStreamFn } from './runtime'
import { createLedger, createReadDiffsTool, createSubmitGroupingTool } from './tools'

export const MAX_TURNS = 12
export const STEER_TURN = 10
export const READ_BUDGET_CHARS = 200_000

const LLM_ROLES = new Set(['system', 'user', 'assistant', 'toolResult'])

export function toLlmMessages(messages: AgentMessage[]): Message[] {
  return messages.filter((message): message is Message => LLM_ROLES.has(message.role))
}

function describeRead(args: unknown): string {
  const paths = (args as { paths?: unknown })?.paths
  const list = Array.isArray(paths) ? paths : []
  const more = list.length > 1 ? ', …' : ''
  return `Reading ${list.length} ${list.length === 1 ? 'file' : 'files'}: ${list[0] ?? ''}${more}`
}

export async function runAgent(diff: DiffsPayload, resolved: ResolvedModel, options?: AnalyzeOptions): Promise<{ analysis: Analysis, transcript: AgentMessage[] }> {
  const ledger = createLedger()
  let steered = false
  let nudged = false

  const context: AgentContext = {
    messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT, timestamp: Date.now() }],
    tools: [createReadDiffsTool(diff, ledger), createSubmitGroupingTool(diff, ledger)],
  }
  const prompt: AgentMessage = { role: 'user', content: buildAnalysisPrompt(diff), timestamp: Date.now() }

  const config: AgentLoopConfig = {
    model: resolved.model,
    apiKey: resolved.apiKey,
    sessionId: diff.id,
    cacheRetention: 'short',
    convertToLlm: toLlmMessages,
    getSteeringMessages: async () => {
      if (steered || (ledger.charsRead <= READ_BUDGET_CHARS && ledger.turn < STEER_TURN))
        return []
      steered = true
      return [{ role: 'user', content: 'Reading budget exhausted. Call submit_grouping now with what you have.', timestamp: Date.now() }]
    },
    getFollowUpMessages: async () => {
      if (nudged || ledger.result !== undefined)
        return []
      nudged = true
      return [{ role: 'user', content: 'Call submit_grouping now.', timestamp: Date.now() }]
    },
    finishTurn: ({ message }) => {
      if (message.stopReason === 'error' || message.stopReason === 'aborted')
        return undefined
      if (ledger.result !== undefined || ledger.turn >= MAX_TURNS)
        return { action: 'end' }
      return undefined
    },
  }

  const emit = (event: AgentEvent) => {
    if (event.type === 'turn_start') {
      ledger.turn += 1
      options?.onProgress?.({ step: ledger.turn, message: `Thinking… (step ${ledger.turn})` })
    }
    else if (event.type === 'tool_execution_start') {
      if (event.toolName === 'read_diffs')
        options?.onProgress?.({ step: ledger.turn, message: describeRead(event.args) })
      else if (event.toolName === 'submit_grouping')
        options?.onProgress?.({ step: ledger.turn, message: 'Organizing groups…' })
    }
  }

  const newMessages = await runAgentLoop([prompt], context, config, emit, options?.signal, createStreamFn(resolved))
  const transcript = [...context.messages, ...newMessages]

  const last = newMessages.findLast((message): message is AssistantMessage => message.role === 'assistant')
  // pi-ai reports an abort that lands during auth setup as stopReason 'error', not 'aborted'.
  if (last?.stopReason === 'aborted' || options?.signal?.aborted)
    throw new DOMException('Aborted', 'AbortError')
  if (last?.stopReason === 'error')
    throw new Error(last.errorMessage)
  if (ledger.result === undefined)
    throw new Error('Agent did not submit a grouping')

  return { analysis: ledger.result, transcript }
}
