import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LocalAgentName } from '@pulls.review/core/analyze'
import type { AgentStreamEvent } from '@pulls.review/core/local-rpc'
import type { AgentSessionRef, DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import type { LlmRunner } from '../analyze/llm-runner'
import type { LocalAgents } from '../analyze/local-agents'
import type { LocalRpc } from './connection'
import { diagnostics } from '@pulls.review/core/diagnostics'
import { AGENT_SESSION_LOST, AgentStreamEventSchema, LOCAL_AGENT_CHANNEL, LOCAL_RPC, LocalAgentInfoSchema } from '@pulls.review/core/local-rpc'
import * as v from 'valibot'
import { ref } from 'vue'
import { settings } from '../state/settings'

/** What one agent run reported before it ended. */
interface Collected {
  messages: AgentMessage[]
  result?: GroupedResult
  session?: AgentSessionRef
}

function collect(collected: Collected, event: AgentStreamEvent) {
  if (event.kind === 'messages')
    collected.messages = event.messages
  else if (event.kind === 'result')
    collected.result = event.result
  else if (event.kind === 'session')
    collected.session = event.session
}

/** What a finished stream amounts to: the collected run, or the error it ended with. */
function ended(end: Extract<AgentStreamEvent, { kind: 'end' }>, collected: Collected): Collected {
  if (end.stopReason === 'aborted')
    throw new DOMException('Aborted', 'AbortError')
  if (end.stopReason === 'error')
    throw end.code === AGENT_SESSION_LOST ? diagnostics.agentSessionLost() : new Error(end.error)
  return collected
}

/** The server's agent list and catalogs, read once each per page load. */
export function createLocalAgents(rpc: LocalRpc): LocalAgents {
  const agents = ref<LocalAgents['agents']['value']>()
  void rpc.call(LOCAL_RPC.agentList).then(list => agents.value = v.parse(v.array(LocalAgentInfoSchema), list))
  const models = new Map<LocalAgentName, Promise<{ id: string, name: string }[]>>()
  return {
    agents,
    models(agent) {
      let list = models.get(agent)
      if (!list) {
        list = rpc.call(LOCAL_RPC.agentModels, { agent }).then(value => v.parse(v.array(v.object({ id: v.string(), name: v.string() })), value))
        models.set(agent, list)
      }
      return list
    },
  }
}

/**
 * Runs analysis and chat on the `pulls.review` server through the agent CLI chosen in
 * Settings; any other provider runs in the browser as on the site.
 */
export function createAgentLlmRunner(rpc: LocalRpc, agents: LocalAgents, browser: LlmRunner): LlmRunner {
  const chosen = () => {
    const { provider, agent, agentModel } = settings.value.llm
    return provider === 'local-agent' && agent ? { agent, model: agentModel || undefined } : undefined
  }

  /** Subscribes to a run's stream and resolves when it ends; rejects with the run's error. */
  async function follow(streamId: string, signal: AbortSignal, onEvent: (event: AgentStreamEvent) => void | Promise<void>): Promise<Collected> {
    const reader = rpc.streaming.subscribe<unknown>(LOCAL_AGENT_CHANNEL, streamId)
    const collected: Collected = { messages: [] }
    const abort = () => {
      void rpc.call(LOCAL_RPC.agentAbort, { streamId })
      reader.cancel()
    }
    signal.addEventListener('abort', abort)
    try {
      for await (const chunk of reader) {
        // The wire validates messages loosely (`local-rpc.ts`); they are the pi messages the server built.
        const event = v.parse(AgentStreamEventSchema, chunk) as AgentStreamEvent
        collect(collected, event)
        await onEvent(event)
        if (event.kind === 'end')
          return ended(event, collected)
      }
    }
    finally {
      signal.removeEventListener('abort', abort)
    }
    if (signal.aborted)
      throw new DOMException('Aborted', 'AbortError')
    throw new Error('The agent run ended without a result.')
  }

  return {
    isSetup() {
      const choice = chosen()
      return choice ? agents.agents.value?.some(info => info.name === choice.agent) ?? false : browser.isSetup()
    },
    async analyze(diff, options) {
      const choice = chosen()
      if (!choice)
        return browser.analyze(diff, options)
      const signal = options.signal ?? new AbortController().signal
      const { streamId } = v.parse(v.object({ streamId: v.string() }), await rpc.call(LOCAL_RPC.agentAnalyze, { ...choice, diff, locale: settings.value.locale }))
      const run = await follow(streamId, signal, (event) => {
        if (event.kind === 'progress')
          options.onProgress?.(event.progress)
        else if (event.kind === 'messages')
          options.onTranscript?.(event.messages)
      })
      if (!run.result)
        throw new Error('The agent run ended without a result.')
      return { result: run.result, transcript: run.messages, agent: run.session }
    },
    async chat(input) {
      const choice = chosen()
      if (!choice)
        return browser.chat(input)
      const { diff, session, text, signal, onMessages, onGroupingUpdate } = input
      const { streamId } = v.parse(v.object({ streamId: v.string() }), await rpc.call(LOCAL_RPC.agentChat, { ...choice, diff: diff satisfies DiffsPayload, locale: settings.value.locale, session, text }))
      const run = await follow(streamId, signal, async (event) => {
        if (event.kind === 'messages')
          onMessages(event.messages)
        else if (event.kind === 'result')
          await onGroupingUpdate(event.result)
      })
      return run.messages
    },
  }
}
