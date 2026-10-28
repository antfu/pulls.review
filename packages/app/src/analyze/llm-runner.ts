import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LlmSession } from '@pulls.review/core/cache'
import type { LlmAnalyzeOptions } from '@pulls.review/core/llm'
import type { AgentSessionRef, DiffsPayload, GroupedResult } from '@pulls.review/core/types'

export interface LlmAnalyzeRun {
  result: GroupedResult
  transcript: AgentMessage[]
  /** Set when an external agent ran the analysis, so the chat can continue its session. */
  agent?: AgentSessionRef
}

export interface LlmChatInput {
  diff: DiffsPayload
  /** The transcript to continue; its last message is the user's turn, or the failed reply `text` absent retries from. */
  session: LlmSession
  /** The user's new message; absent means continue the transcript as it is (the chat's retry). */
  text?: string
  signal: AbortSignal
  /** The live transcript so far, replaced each time. */
  onMessages: (messages: AgentMessage[]) => void
  onGroupingUpdate: (result: GroupedResult) => void | Promise<void>
}

/**
 * Where a model runs. Today that is this browser with the signed-in user's
 * synced Settings; a server-side agent runner can implement the same contract.
 * One per app context; `createLlmStore` and `useLlmChat` only talk to this.
 */
export interface LlmRunner {
  /** Reactive: reads Settings (and sign-in state on the hosted site). */
  isSetup: () => boolean
  analyze: (diff: DiffsPayload, options: LlmAnalyzeOptions) => Promise<LlmAnalyzeRun>
  /** Resolves to the whole transcript after the reply; an error reply is a message with `stopReason: 'error'`, not a rejection. */
  chat: (input: LlmChatInput) => Promise<AgentMessage[]>
}
