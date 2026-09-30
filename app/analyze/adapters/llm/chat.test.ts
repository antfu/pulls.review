import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core'
import type { ToolResultMessage } from '@earendil-works/pi-ai'
import type { GroupedResult } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { ResolvedModel } from './model'
import type { Analysis } from './schema'
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from './agent'
import { compactContext, createChatSession, LANGUAGE_REMINDER, MAX_CHAT_TURNS, OMITTED_DIFF_TEXT, withChatInstructions, withLanguageReminder } from './chat'
import { AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_SECTION } from './prompt'

const runtime = vi.hoisted(() => ({ streamFn: undefined as StreamFn | undefined }))

vi.mock('./runtime', () => ({ createStreamFn: () => runtime.streamFn }))

const faux = fauxProvider()
const models = createModels()
models.setProvider(faux.provider)
runtime.streamFn = models.streamSimple.bind(models)

function file(path: string): DiffsPayload['files'][number] {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    isBinary: false,
    sha: path,
    hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch: '+x' }],
  }
}

const diff: DiffsPayload = { provider: 'github', id: 'github:o/r#1', title: 'My PR', files: [file('a.ts'), file('b.ts')] }

function oneGroup(...filePaths: string[]): Analysis {
  return { overallSummary: 'Adds a feature.', groups: [{ key: 'feature', label: 'Feature', category: 'core', filePaths }] }
}

function toolUse(name: string, args: Parameters<typeof fauxToolCall>[1]) {
  return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' })
}

let resolved: ResolvedModel

async function analysisTranscript(): Promise<AgentMessage[]> {
  faux.setResponses([toolUse('read_diffs', { paths: ['a.ts'] }), toolUse('submit_grouping', oneGroup('a.ts', 'b.ts'))])
  const { transcript } = await runAgent(diff, resolved, 'en')
  faux.state.callCount = 0
  return transcript
}

function readResult(id: string, text: string): ToolResultMessage {
  return { role: 'toolResult', toolCallId: id, toolName: 'read_diffs', content: [{ type: 'text', text }], isError: false, timestamp: 0 }
}

beforeEach(() => {
  faux.setResponses([])
  faux.state.callCount = 0
  resolved = { model: faux.getModel(), apiKey: 'test-key' }
})

describe('createChatSession', () => {
  it('streams a plain answer and appends it to the transcript', async () => {
    const agent = createChatSession({ diff, resolved, messages: await analysisTranscript(), onGroupingUpdate: vi.fn() })
    const deltas: string[] = []
    agent.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta')
        deltas.push(event.assistantMessageEvent.delta)
    })
    faux.setResponses([fauxAssistantMessage('Because of a.ts.')])

    await agent.prompt('why?')

    expect(deltas.join('')).toBe('Because of a.ts.')
    expect(agent.state.messages.at(-2)).toMatchObject({ role: 'user' })
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'Because of a.ts.' }] })
  })

  it('reports a successful update_grouping as a reconciled result', async () => {
    const onGroupingUpdate = vi.fn<(result: GroupedResult) => void>()
    const agent = createChatSession({ diff, resolved, messages: await analysisTranscript(), onGroupingUpdate })
    faux.setResponses([
      toolUse('update_grouping', { overallSummary: 'Split.', groups: [{ key: 'a', label: 'A', category: 'core', filePaths: ['a.ts'] }, { key: 'b', label: 'B', category: 'core', filePaths: ['b.ts'] }] }),
      fauxAssistantMessage('Split into two groups.'),
    ])

    await agent.prompt('split it')

    expect(onGroupingUpdate).toHaveBeenCalledOnce()
    expect(onGroupingUpdate.mock.calls[0]![0]).toMatchObject({
      source: 'llm',
      overallSummary: 'Split.',
      groups: [{ key: 'a', filePaths: ['a.ts'] }, { key: 'b', filePaths: ['b.ts'] }],
    })
    expect(agent.state.messages.findLast(message => message.role === 'toolResult')).toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'Grouping updated: 2 groups.' }],
    })
  })

  it('returns a coverage error to the model without updating', async () => {
    const onGroupingUpdate = vi.fn()
    const agent = createChatSession({ diff, resolved, messages: await analysisTranscript(), onGroupingUpdate })
    faux.setResponses([toolUse('update_grouping', oneGroup('a.ts')), fauxAssistantMessage('Sorry.')])

    await agent.prompt('only a.ts')

    expect(onGroupingUpdate).not.toHaveBeenCalled()
    const result = agent.state.messages.findLast(message => message.role === 'toolResult')
    expect(result).toMatchObject({ isError: true })
    expect(JSON.stringify(result)).toContain('Missing paths: b.ts')
  })

  it(`stops after ${MAX_CHAT_TURNS} turns per user message`, async () => {
    const agent = createChatSession({ diff, resolved, messages: await analysisTranscript(), onGroupingUpdate: vi.fn() })
    faux.setResponses(Array.from({ length: MAX_CHAT_TURNS + 3 }, () => toolUse('read_diffs', { paths: ['b.ts'] })))

    await agent.prompt('read forever')

    expect(faux.state.callCount).toBe(MAX_CHAT_TURNS)
    expect(agent.state.isStreaming).toBe(false)
  })
})

describe('withChatInstructions', () => {
  it('swaps submit_grouping for update_grouping and adds the chat section once', async () => {
    const transcript = await analysisTranscript()
    const chat = withChatInstructions(transcript)

    expect(chat).toHaveLength(transcript.length + 1)
    expect(withChatInstructions(chat)).toBe(chat)
    expect(getCurrentTools(chat).map(tool => tool.name)).toEqual(['read_diffs', 'update_grouping'])
    const prompt = getCurrentSystemPrompt(chat)
    expect(prompt).toContain(AGENT_SYSTEM_PROMPT)
    expect(prompt).toContain(CHAT_SYSTEM_SECTION)
  })
})

describe('compactContext', () => {
  const big = 'x'.repeat(1_000)
  const messages: AgentMessage[] = [
    readResult('r1', big),
    { role: 'toolResult', toolCallId: 'u1', toolName: 'update_grouping', content: [{ type: 'text', text: big }], isError: false, timestamp: 0 },
    readResult('r2', big),
    readResult('r3', big),
  ]
  const size = JSON.stringify(messages).length

  it('returns the input unchanged when under the limit', () => {
    expect(compactContext(messages, size)).toBe(messages)
  })

  it('omits the oldest read_diffs results first and stops once under the limit', () => {
    const compacted = compactContext(messages, size - 1_500) as ToolResultMessage[]

    expect(compacted).toHaveLength(messages.length)
    expect(compacted.map(message => message.toolCallId)).toEqual(['r1', 'u1', 'r2', 'r3'])
    expect(compacted.map(message => (message.content[0] as { text: string }).text)).toEqual([OMITTED_DIFF_TEXT, big, OMITTED_DIFF_TEXT, big])
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(size - 1_500)
    expect((messages[0] as ToolResultMessage).content[0]).toEqual({ type: 'text', text: big })
  })
})

describe('withLanguageReminder', () => {
  it('appends the reminder to the latest user message only, without mutating the input', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: '第一个问题', timestamp: 1 },
      { role: 'user', content: [{ type: 'text', text: '第二个问题' }], timestamp: 2 },
    ]
    const result = withLanguageReminder(messages)
    expect(result[0]).toBe(messages[0])
    expect(result[1]).toMatchObject({ content: [{ type: 'text', text: '第二个问题' }, { type: 'text', text: LANGUAGE_REMINDER }] })
    expect(messages[1]).toMatchObject({ content: [{ type: 'text', text: '第二个问题' }] })
  })

  it('returns the input when there is no user message', () => {
    const messages: AgentMessage[] = []
    expect(withLanguageReminder(messages)).toBe(messages)
  })
})
