import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { LlmSession } from '@pulls.review/core/cache'
import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import type { Ref } from 'vue'
import type { LlmRunner } from '../analyze/llm-runner'
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, toRaw } from 'vue'
import { t } from '../i18n'
import { localizeError } from '../i18n/core-messages'

export interface LlmChatOptions {
  runner: LlmRunner
  diff: Ref<DiffsPayload | undefined>
  session: Ref<LlmSession | undefined>
  onSessionChange: (session: LlmSession) => void | Promise<void>
  onGroupingUpdate: (result: GroupedResult) => void | Promise<void>
}

function isErrorReply(message: AgentMessage | undefined): message is AssistantMessage {
  return message?.role === 'assistant' && message.stopReason === 'error'
}

export function useLlmChat({ runner, diff, session, onSessionChange, onGroupingUpdate }: LlmChatOptions) {
  const isStreaming = ref(false)
  const error = ref<Error>()
  const live = shallowRef<{ session: LlmSession, messages: AgentMessage[] }>()
  let abortController: AbortController | undefined

  const available = computed(() => session.value !== undefined)
  const messages = computed(() => {
    const liveMessages = live.value?.session === session.value ? live.value?.messages : undefined
    return (liveMessages ?? session.value?.messages ?? []).slice(session.value?.chatStartIndex ?? 0)
  })

  /** `text` absent continues `history` as it is (a retry). */
  async function run(text: string | undefined, history: AgentMessage[]) {
    const currentDiff = toRaw(diff.value)
    const current = session.value
    if (!currentDiff || !current || isStreaming.value)
      return

    // A clear, re-analysis or refresh during the run replaces the session; the run must not write over it.
    const isStale = () => session.value !== current || toRaw(diff.value) !== currentDiff

    error.value = undefined
    isStreaming.value = true
    const controller = new AbortController()
    abortController = controller
    try {
      const next = await runner.chat({
        diff: currentDiff,
        session: { ...current, messages: history },
        text,
        signal: controller.signal,
        onMessages: messages => live.value = { session: current, messages },
        onGroupingUpdate: result => isStale() ? undefined : onGroupingUpdate(result),
      })
      if (isStale() || controller.signal.aborted)
        return
      await onSessionChange({ ...current, messages: next })
      const last = next.at(-1)
      if (isErrorReply(last))
        error.value = new Error(last.errorMessage ?? t('analyze.chatFailed'))
    }
    catch (err) {
      if (!isStale() && !controller.signal.aborted)
        error.value = localizeError(err)
    }
    finally {
      if (abortController === controller)
        abortController = undefined
      live.value = undefined
      isStreaming.value = false
    }
  }

  async function send(text: string) {
    if (!text.trim() || !session.value)
      return
    await run(text, toRaw(session.value.messages))
  }

  async function retry() {
    const current = toRaw(session.value?.messages)
    if (!current || !isErrorReply(current.at(-1)))
      return
    await run(undefined, current.slice(0, -1))
  }

  function stop() {
    abortController?.abort()
  }

  if (getCurrentScope())
    onScopeDispose(stop)

  async function clear() {
    const current = session.value
    if (!current)
      return
    stop()
    error.value = undefined
    await onSessionChange({ ...current, messages: toRaw(current.messages).slice(0, current.chatStartIndex) })
  }

  return { available, messages, isStreaming, error, send, retry, stop, clear }
}
