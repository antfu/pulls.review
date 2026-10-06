import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Locale } from '../../../locales'
import type { GroupedResult } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { ResolvedModel } from './model'
import { Agent } from '@earendil-works/pi-agent-core'
import { serializeRef } from '../../../types/source'
import { toLlmMessages } from './agent'
import { modelStamp, toGroupedResult } from './index'
import { CHAT_SYSTEM_SECTION } from './prompt'
import { createStreamFn } from './runtime'
import { createLedger, createReadDiffsTool, createUpdateGroupingTool, UPDATE_GROUPING_DECLARATION } from './tools'

export const MAX_CHAT_TURNS = 8
export const CHAT_CONTEXT_CHAR_LIMIT = 400_000
export const OMITTED_DIFF_TEXT = '(diff omitted, call read_diffs again if needed)'
export const LANGUAGE_REMINDER = '<reminder>Reply in the same language as this message.</reminder>'

export function withChatInstructions(messages: AgentMessage[]): AgentMessage[] {
  if (messages.some(message => message.role === 'system' && message.sections?.chat !== undefined))
    return messages
  return [...messages, {
    role: 'system',
    content: '',
    sections: { chat: CHAT_SYSTEM_SECTION },
    toolsAdded: [UPDATE_GROUPING_DECLARATION],
    toolsRemoved: [{ name: 'submit_grouping' }],
    timestamp: Date.now(),
  }]
}

export function compactContext(messages: AgentMessage[], limit = CHAT_CONTEXT_CHAR_LIMIT): AgentMessage[] {
  let size = JSON.stringify(messages).length
  if (size <= limit)
    return messages

  const omitted = [{ type: 'text' as const, text: OMITTED_DIFF_TEXT }]
  const omittedSize = JSON.stringify(omitted).length
  const result = [...messages]
  for (let i = 0; i < result.length && size > limit; i++) {
    const message = result[i]!
    if (message.role !== 'toolResult' || message.toolName !== 'read_diffs')
      continue
    const saved = JSON.stringify(message.content).length - omittedSize
    if (saved <= 0)
      continue
    result[i] = { ...message, content: omitted }
    size -= saved
  }
  return result
}

/**
 * Models such as DeepSeek drift to the English of the surrounding diff context and ignore the
 * system-prompt rule, so the reminder rides on the latest user turn for this request only.
 */
export function withLanguageReminder(messages: AgentMessage[]): AgentMessage[] {
  const index = messages.findLastIndex(message => message.role === 'user')
  if (index === -1)
    return messages
  const message = messages[index]!
  if (message.role !== 'user')
    return messages
  const reminder = { type: 'text' as const, text: LANGUAGE_REMINDER }
  const content = typeof message.content === 'string'
    ? [{ type: 'text' as const, text: message.content }, reminder]
    : [...message.content, reminder]
  const result = [...messages]
  result[index] = { ...message, content }
  return result
}

export interface ChatSessionOptions {
  diff: DiffsPayload
  resolved: ResolvedModel
  /** Stamped on groupings the chat updates. */
  locale: Locale
  messages: AgentMessage[]
  onGroupingUpdate: (result: GroupedResult) => void | Promise<void>
}

export function createChatSession({ diff, resolved, locale, messages, onGroupingUpdate }: ChatSessionOptions): Agent {
  const ledger = createLedger()
  return new Agent({
    initialState: {
      model: resolved.model,
      tools: [
        createReadDiffsTool(diff, ledger),
        createUpdateGroupingTool(diff, analysis => onGroupingUpdate(toGroupedResult(diff, analysis, modelStamp(resolved), locale))),
      ],
      messages: withChatInstructions(messages),
    },
    streamFn: createStreamFn(resolved),
    getApiKey: () => resolved.apiKey,
    sessionId: serializeRef(diff.ref),
    convertToLlm: toLlmMessages,
    transformContext: async (messages) => {
      const compacted = compactContext(messages)
      // Omitted reads must be re-readable, not answered with "(already shown above)".
      if (compacted !== messages)
        ledger.readPaths.clear()
      return withLanguageReminder(compacted)
    },
    finishTurn: ({ message, newMessages }) => {
      if (message.stopReason === 'error' || message.stopReason === 'aborted')
        return undefined
      if (newMessages.filter(m => m.role === 'assistant').length >= MAX_CHAT_TURNS)
        return { action: 'end' }
      return undefined
    },
  })
}
