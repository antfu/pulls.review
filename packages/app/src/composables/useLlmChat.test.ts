import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LlmSession } from '@pulls.review/core/cache'
import type { DiffsPayload } from '@pulls.review/core/types'
import type { LlmChatInput, LlmRunner } from '../analyze/llm-runner'
import { fauxAssistantMessage } from '@earendil-works/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { useLlmChat } from './useLlmChat'

let reply: AgentMessage
/** Runs in place of the model: appends the user's turn (on send) and `reply`, reporting the transcript live. */
let chatImpl: (input: LlmChatInput) => Promise<AgentMessage[]>

const runnerChat = vi.fn((input: LlmChatInput) => chatImpl(input))
const runner: LlmRunner = { isSetup: () => true, analyze: vi.fn(), chat: runnerChat }

async function replyTo({ session, text, onMessages }: LlmChatInput) {
  const next = text === undefined ? [...session.messages, reply] : [...session.messages, { role: 'user' as const, content: text, timestamp: 0 }, reply]
  onMessages(next)
  return next
}

const diff = { ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' }, title: 'PR', files: [] } as DiffsPayload
const transcript: AgentMessage[] = [{ role: 'user', content: 'analyze', timestamp: 0 }]

function setup() {
  const sessionRef = shallowRef<LlmSession>({ messages: transcript, chatStartIndex: transcript.length, agent: { agent: 'claude', id: 's1' } })
  const onSessionChange = vi.fn((next: LlmSession) => {
    sessionRef.value = next
  })
  const onGroupingUpdate = vi.fn()
  const chat = useLlmChat({ runner, diff: ref(diff), session: sessionRef, onSessionChange, onGroupingUpdate })
  return { chat, sessionRef, onSessionChange, onGroupingUpdate }
}

beforeEach(() => {
  runnerChat.mockClear()
  chatImpl = replyTo
  reply = fauxAssistantMessage('Because.')
})

describe('useLlmChat', () => {
  it('is unavailable without a session', () => {
    const chat = useLlmChat({ runner, diff: ref(diff), session: ref(), onSessionChange: vi.fn(), onGroupingUpdate: vi.fn() })
    expect(chat.available.value).toBe(false)
  })

  it('persists the transcript with the same chatStartIndex and agent session after a send', async () => {
    const { chat, onSessionChange } = setup()

    await chat.send('why?')

    expect(onSessionChange).toHaveBeenCalledOnce()
    const next = onSessionChange.mock.calls[0]![0]
    expect(next.chatStartIndex).toBe(transcript.length)
    expect(next.agent).toEqual({ agent: 'claude', id: 's1' })
    expect(next.messages).toHaveLength(3)
    expect(chat.messages.value.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(chat.error.value).toBeUndefined()
    expect(chat.isStreaming.value).toBe(false)
  })

  it('ignores whitespace-only sends', async () => {
    const { chat, onSessionChange } = setup()

    await chat.send('   \n')

    expect(runner.chat).not.toHaveBeenCalled()
    expect(onSessionChange).not.toHaveBeenCalled()
  })

  it('shows a rejected run as its error', async () => {
    chatImpl = async () => {
      throw new Error('not configured')
    }
    const { chat } = setup()

    await chat.send('why?')

    expect(chat.error.value?.message).toBe('not configured')
    expect(chat.isStreaming.value).toBe(false)
  })

  it('surfaces a provider error reply as error and retries from the user message', async () => {
    reply = fauxAssistantMessage([], { stopReason: 'error', errorMessage: '401 Unauthorized' })
    const { chat, sessionRef } = setup()

    await chat.send('why?')
    expect(chat.error.value?.message).toBe('401 Unauthorized')

    reply = fauxAssistantMessage('Because.')
    await chat.retry()

    const retried = runnerChat.mock.calls[1]![0]
    expect(retried.text).toBeUndefined()
    expect(retried.session.messages.at(-1)).toMatchObject({ role: 'user', content: 'why?' })
    expect(chat.error.value).toBeUndefined()
    expect(sessionRef.value!.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'stop' })
  })

  it('drops the grouping update and persist of a run whose session was replaced mid-run', async () => {
    const { chat, sessionRef, onSessionChange, onGroupingUpdate } = setup()
    let shownMidRun: AgentMessage[] = []
    const replaced: LlmSession = { messages: [...transcript, { role: 'user', content: 'reanalyzed', timestamp: 1 }], chatStartIndex: 1 }
    chatImpl = async (input) => {
      sessionRef.value = replaced
      shownMidRun = chat.messages.value
      await input.onGroupingUpdate({ source: 'llm', groups: [], generatedAt: '', schemaVersion: 1 })
      return input.session.messages
    }

    await chat.send('regroup')

    expect(onGroupingUpdate).not.toHaveBeenCalled()
    expect(onSessionChange).not.toHaveBeenCalled()
    expect(sessionRef.value).toBe(replaced)
    expect(shownMidRun).toEqual(replaced.messages.slice(1))
  })

  it('does not persist a run stopped before it finished', async () => {
    const { chat, onSessionChange } = setup()
    chatImpl = ({ signal, session }) => new Promise(resolve => signal.addEventListener('abort', () => resolve(session.messages)))

    const sending = chat.send('why?')
    chat.stop()
    await sending

    expect(onSessionChange).not.toHaveBeenCalled()
    expect(chat.error.value).toBeUndefined()
    expect(chat.isStreaming.value).toBe(false)
  })

  it('clear() truncates the session back to chatStartIndex and keeps the agent session', async () => {
    const { chat, sessionRef } = setup()
    await chat.send('why?')

    await chat.clear()

    expect(sessionRef.value).toEqual({ messages: transcript, chatStartIndex: transcript.length, agent: { agent: 'claude', id: 's1' } })
    expect(chat.messages.value).toEqual([])
  })
})
