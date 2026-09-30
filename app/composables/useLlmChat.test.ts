import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LlmSession } from '../types/cache'
import type { DiffsPayload } from '../types/diff'
import { fauxAssistantMessage } from '@earendil-works/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { notConfiguredError } from '../analyze/adapters/llm/model'
import { useLlmChat } from './useLlmChat'

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  reply: undefined as AgentMessage | undefined,
  createChatSession: vi.fn(),
}))

vi.mock('../analyze/adapters/llm/model', async importOriginal => ({
  ...await importOriginal<typeof import('../analyze/adapters/llm/model')>(),
  resolveModel: mocks.resolveModel,
}))

vi.mock('../analyze/adapters/llm/chat', () => ({ createChatSession: mocks.createChatSession }))

function fakeAgent({ messages }: { messages: AgentMessage[] }) {
  const state = { messages: [...messages], streamingMessage: undefined as AgentMessage | undefined }
  return {
    state,
    subscribe: () => () => {},
    abort: vi.fn(),
    async prompt(text: string) {
      state.messages.push({ role: 'user', content: text, timestamp: 0 }, mocks.reply!)
    },
    async continue() {
      state.messages.push(mocks.reply!)
    },
  }
}

const diff = { provider: 'github', id: 'github:o/r#1', title: 'PR', files: [] } as DiffsPayload
const transcript: AgentMessage[] = [{ role: 'user', content: 'analyze', timestamp: 0 }]

function setup() {
  const sessionRef = shallowRef<LlmSession>({ messages: transcript, chatStartIndex: transcript.length })
  const onSessionChange = vi.fn((next: LlmSession) => {
    sessionRef.value = next
  })
  const onGroupingUpdate = vi.fn()
  const chat = useLlmChat({ diff: ref(diff), session: sessionRef, onSessionChange, onGroupingUpdate })
  return { chat, sessionRef, onSessionChange, onGroupingUpdate }
}

beforeEach(() => {
  mocks.resolveModel.mockReset().mockReturnValue({ model: {}, apiKey: 'key' })
  mocks.createChatSession.mockReset().mockImplementation(fakeAgent)
  mocks.reply = fauxAssistantMessage('Because.')
})

describe('useLlmChat', () => {
  it('is unavailable without a session', () => {
    const chat = useLlmChat({ diff: ref(diff), session: ref(), onSessionChange: vi.fn(), onGroupingUpdate: vi.fn() })
    expect(chat.available.value).toBe(false)
  })

  it('persists the transcript with the same chatStartIndex after a send', async () => {
    const { chat, onSessionChange } = setup()

    await chat.send('why?')

    expect(onSessionChange).toHaveBeenCalledOnce()
    const next = onSessionChange.mock.calls[0]![0]
    expect(next.chatStartIndex).toBe(transcript.length)
    expect(next.messages).toHaveLength(3)
    expect(chat.messages.value.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(chat.error.value).toBeUndefined()
    expect(chat.isStreaming.value).toBe(false)
  })

  it('ignores whitespace-only sends', async () => {
    const { chat, onSessionChange } = setup()

    await chat.send('   \n')

    expect(mocks.createChatSession).not.toHaveBeenCalled()
    expect(onSessionChange).not.toHaveBeenCalled()
  })

  it('sets error when no model is configured', async () => {
    mocks.resolveModel.mockReturnValue(undefined)
    const { chat } = setup()

    await chat.send('why?')

    expect(chat.error.value?.message).toBe(notConfiguredError().message)
    expect(mocks.createChatSession).not.toHaveBeenCalled()
  })

  it('surfaces a provider error reply as error and retries from the user message', async () => {
    mocks.reply = fauxAssistantMessage([], { stopReason: 'error', errorMessage: '401 Unauthorized' })
    const { chat, sessionRef } = setup()

    await chat.send('why?')
    expect(chat.error.value?.message).toBe('401 Unauthorized')

    mocks.reply = fauxAssistantMessage('Because.')
    await chat.retry()

    expect(mocks.createChatSession.mock.calls[1]![0].messages.at(-1)).toMatchObject({ role: 'user', content: 'why?' })
    expect(chat.error.value).toBeUndefined()
    expect(sessionRef.value!.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'stop' })
  })

  it('drops the grouping update and persist of a run whose session was replaced mid-run', async () => {
    const { chat, sessionRef, onSessionChange, onGroupingUpdate } = setup()
    let shownMidRun: AgentMessage[] = []
    const replaced: LlmSession = { messages: [...transcript, { role: 'user', content: 'reanalyzed', timestamp: 1 }], chatStartIndex: 1 }
    mocks.createChatSession.mockImplementation((options: { messages: AgentMessage[], onGroupingUpdate: (result: unknown) => unknown }) => {
      const agent = fakeAgent(options)
      agent.prompt = async () => {
        sessionRef.value = replaced
        shownMidRun = chat.messages.value
        await options.onGroupingUpdate({ source: 'llm', groups: [] })
      }
      return agent
    })

    await chat.send('regroup')

    expect(onGroupingUpdate).not.toHaveBeenCalled()
    expect(onSessionChange).not.toHaveBeenCalled()
    expect(sessionRef.value).toBe(replaced)
    expect(shownMidRun).toEqual(replaced.messages.slice(1))
  })

  it('does not start a run stopped while the chat module is still loading', async () => {
    const { chat, onSessionChange } = setup()

    const sending = chat.send('why?')
    chat.stop()
    await sending

    expect(mocks.createChatSession).not.toHaveBeenCalled()
    expect(onSessionChange).not.toHaveBeenCalled()
    expect(chat.isStreaming.value).toBe(false)
  })

  it('clear() truncates the session back to chatStartIndex', async () => {
    const { chat, sessionRef } = setup()
    await chat.send('why?')

    await chat.clear()

    expect(sessionRef.value).toEqual({ messages: transcript, chatStartIndex: transcript.length })
    expect(chat.messages.value).toEqual([])
  })
})
