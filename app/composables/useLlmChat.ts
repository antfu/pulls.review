import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { Ref } from 'vue'
import type { GroupedResult } from '../types/analyze'
import type { LlmSession } from '../types/cache'
import type { DiffsPayload } from '../types/diff'
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, toRaw } from 'vue'
import { NOT_CONFIGURED_MESSAGE, resolveModel } from '../analyze/adapters/llm/model'

export interface LlmChatOptions {
  diff: Ref<DiffsPayload | undefined>
  session: Ref<LlmSession | undefined>
  onSessionChange: (session: LlmSession) => void | Promise<void>
  onGroupingUpdate: (result: GroupedResult) => void | Promise<void>
}

function isErrorReply(message: AgentMessage | undefined): message is AssistantMessage {
  return message?.role === 'assistant' && message.stopReason === 'error'
}

export function useLlmChat({ diff, session, onSessionChange, onGroupingUpdate }: LlmChatOptions) {
  const isStreaming = ref(false)
  const error = ref<Error>()
  const live = shallowRef<{ session: LlmSession, messages: AgentMessage[] }>()
  let liveAgent: Agent | undefined
  let stopRequested = false

  const available = computed(() => session.value !== undefined)
  const messages = computed(() => {
    const liveMessages = live.value?.session === session.value ? live.value?.messages : undefined
    return (liveMessages ?? session.value?.messages ?? []).slice(session.value?.chatStartIndex ?? 0)
  })

  async function run(start: (agent: Agent) => Promise<void>, history: AgentMessage[]) {
    const currentDiff = toRaw(diff.value)
    const current = session.value
    if (!currentDiff || !current || isStreaming.value)
      return
    const resolved = resolveModel()
    if (!resolved) {
      error.value = new Error(NOT_CONFIGURED_MESSAGE)
      return
    }

    // A clear, re-analysis or refresh during the run replaces the session; the run must not write over it.
    const isStale = () => session.value !== current || toRaw(diff.value) !== currentDiff

    error.value = undefined
    isStreaming.value = true
    stopRequested = false
    try {
      const { createChatSession } = await import('../analyze/adapters/llm/chat')
      if (stopRequested || isStale())
        return
      const agent = createChatSession({
        diff: currentDiff,
        resolved,
        messages: history,
        onGroupingUpdate: result => isStale() ? undefined : onGroupingUpdate(result),
      })
      liveAgent = agent
      const sync = () => {
        const { streamingMessage } = agent.state
        live.value = { session: current, messages: streamingMessage ? [...agent.state.messages, streamingMessage] : [...agent.state.messages] }
      }
      sync()
      const unsubscribe = agent.subscribe(sync)
      try {
        await start(agent)
      }
      finally {
        unsubscribe()
      }

      if (isStale())
        return
      const next = { messages: [...agent.state.messages], chatStartIndex: current.chatStartIndex }
      await onSessionChange(next)
      const last = next.messages.at(-1)
      if (isErrorReply(last))
        error.value = new Error(last.errorMessage ?? 'Chat request failed')
    }
    catch (err) {
      if (!isStale())
        error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      liveAgent = undefined
      live.value = undefined
      isStreaming.value = false
    }
  }

  async function send(text: string) {
    if (!text.trim() || !session.value)
      return
    await run(agent => agent.prompt(text), toRaw(session.value.messages))
  }

  async function retry() {
    const current = toRaw(session.value?.messages)
    if (!current || !isErrorReply(current.at(-1)))
      return
    await run(agent => agent.continue(), current.slice(0, -1))
  }

  function stop() {
    stopRequested = true
    liveAgent?.abort()
  }

  if (getCurrentScope())
    onScopeDispose(stop)

  async function clear() {
    const current = session.value
    if (!current)
      return
    stop()
    error.value = undefined
    await onSessionChange({ messages: toRaw(current.messages).slice(0, current.chatStartIndex), chatStartIndex: current.chatStartIndex })
  }

  return { available, messages, isStreaming, error, send, retry, stop, clear }
}
