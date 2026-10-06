import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolCall, ToolResultMessage } from '@earendil-works/pi-ai'
import type { LocalAgentName } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'

export interface AgentRunInput {
  /** The repository for a local target; an empty temp dir for a GitHub one. */
  cwd: string
  system: string
  prompt: string
  /** Omitted = the agent's default. */
  model?: string
  /** A session id to continue. */
  resume?: string
  signal: AbortSignal
}

/** What a CLI's own event stream is mapped into; nothing outside the adapter knows the CLI's format. */
export type AgentCliEvent
  = | { kind: 'session', id: string, model?: string }
    | { kind: 'message', message: AgentMessage }
    /** The last answer: structured output when the CLI validated it, else the final text. `isError`: the CLI reported the run failed, `text` says why. */
    | { kind: 'final', text?: string, structured?: unknown, isError?: boolean }
    | { kind: 'exit', code: number | null, stderr: string, sessionLost: boolean }

export interface AgentCli {
  name: LocalAgentName
  label: string
  /** The CLI's version, or `undefined` when it is not on `PATH`. */
  detect: () => Promise<string | undefined>
  /** The agent's model catalog; `[]` when the CLI has none to list. */
  models: () => Promise<ModelOption[]>
  /** One subprocess, start to exit. */
  run: (input: AgentRunInput) => AsyncIterable<AgentCliEvent>
}

const ZERO_USAGE: AssistantMessage['usage'] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }

/** An agent's turn as the pi message the app's transcript and chat render. */
export function assistantMessage(provider: string, model: string, content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider,
    model,
    usage: ZERO_USAGE,
    stopReason: content.some(part => part.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: Date.now(),
  }
}

export function toolCall(id: string, name: string, args: unknown): ToolCall {
  // The CLI's own tool arguments: JSON already, as they came off its stream.
  return { type: 'toolCall', id, name, arguments: (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as ToolCall['arguments'] }
}

export function toolResultMessage(toolCallId: string, toolName: string, text: string, isError = false): ToolResultMessage {
  return { role: 'toolResult', toolCallId, toolName, content: [{ type: 'text', text }], isError, timestamp: Date.now() }
}
