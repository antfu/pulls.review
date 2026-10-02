import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core'
import type { AnalyzeProgress } from '../../../types/analyze'
import type { DiffsPayload } from '../../../types/diff'
import type { Analysis } from './schema'
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TURNS, STEER_TURN } from './agent'
import { runLlmAnalysis } from './index'
import { resolveModel } from './model'
import { AGENT_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'
import { defaultLlmSettings } from './settings'

const runtime = vi.hoisted(() => ({ streamFn: undefined as StreamFn | undefined }))

vi.mock('./runtime', () => ({ createStreamFn: () => runtime.streamFn }))

const STEERING_TEXT = 'Reading budget exhausted. Call submit_grouping now with what you have.'
const faux = fauxProvider()
const models = createModels()
models.setProvider(faux.provider)
runtime.streamFn = models.streamSimple.bind(models)

function file(path: string, patch = '+x'): DiffsPayload['files'][number] {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    isBinary: false,
    sha: path,
    hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch }],
  }
}

function diffWithFiles(...files: DiffsPayload['files']): DiffsPayload {
  return {
    ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
    title: 'My PR',
    description: 'Does things',
    files,
  }
}

function read(...paths: string[]) {
  return fauxAssistantMessage(fauxToolCall('read_diffs', { paths }), { stopReason: 'toolUse' })
}

function submit(analysis: Analysis) {
  return fauxAssistantMessage(fauxToolCall('submit_grouping', analysis), { stopReason: 'toolUse' })
}

function steeringCount(messages: { role: string, content?: unknown }[]) {
  return messages.filter(message => message.role === 'user' && message.content === STEERING_TEXT).length
}

function oneGroup(...filePaths: string[]): Analysis {
  return {
    overallSummary: 'Adds a feature.',
    groups: [{ key: 'feature', label: 'Feature', category: 'core', filePaths }],
  }
}

beforeEach(() => {
  faux.setResponses([])
  faux.state.callCount = 0
})

const fauxModel = { model: faux.getModel(), apiKey: 'test-key' }
const analyze = (diff: DiffsPayload, options?: Parameters<typeof runLlmAnalysis>[3]) => runLlmAnalysis(diff, fauxModel, 'en', options)

describe('resolveModel', () => {
  it('maps each provider setting to a pi-ai model', () => {
    expect(resolveModel({ ...defaultLlmSettings, provider: 'gateway', gatewayToken: 'gw' })).toMatchObject({ apiKey: 'gw', model: { id: 'anthropic/claude-sonnet-5', api: 'anthropic-messages', provider: 'vercel-ai-gateway', baseUrl: 'https://ai-gateway.vercel.sh' } })
    expect(resolveModel({ ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant' })).toMatchObject({ apiKey: 'sk-ant', model: { id: 'claude-sonnet-5', api: 'anthropic-messages', provider: 'anthropic', baseUrl: 'https://api.anthropic.com' } })
    expect(resolveModel({ ...defaultLlmSettings, provider: 'openai-compatible', openaiApiKey: 'sk-oa', openaiBaseUrl: 'https://llm.local/v1' })).toMatchObject({ apiKey: 'sk-oa', model: { id: 'gpt-5.1', api: 'openai-completions', provider: 'openai-compatible', baseUrl: 'https://llm.local/v1' } })
  })

  it('is undefined while the selected provider has no token, whatever the others have', () => {
    expect(resolveModel(defaultLlmSettings)).toBeUndefined()
    expect(resolveModel({ ...defaultLlmSettings, provider: 'gateway', anthropicApiKey: 'sk-ant-x' })).toBeUndefined()
  })
})

describe('runLlmAnalysis', () => {
  it('reads diffs, then returns the submitted grouping and the full transcript', async () => {
    const diff = diffWithFiles(file('a.ts'), file('b.ts'))
    faux.setResponses([read('a.ts'), submit(oneGroup('a.ts', 'b.ts'))])

    const { result, transcript } = await analyze(diff)

    expect(result.source).toBe('llm')
    expect(result.overallSummary).toBe('Adds a feature.')
    expect(result.groups).toEqual([{ key: 'feature', label: 'Feature', category: 'core', filePaths: ['a.ts', 'b.ts'] }])
    expect(result.locale).toBe('en')
    expect(transcript[0]).toMatchObject({ role: 'system', content: AGENT_SYSTEM_PROMPT })
    expect(transcript.find(message => message.role !== 'system')).toMatchObject({ role: 'user', content: buildAnalysisPrompt(diff, 'en') })
    expect(transcript.filter(message => message.role === 'toolResult')).toHaveLength(2)
  })

  it('lets the model resubmit after a coverage error', async () => {
    faux.setResponses([submit(oneGroup('a.ts')), submit(oneGroup('a.ts', 'b.ts'))])

    const { result, transcript } = await analyze(diffWithFiles(file('a.ts'), file('b.ts')))

    expect(faux.state.callCount).toBe(2)
    expect(result.groups[0]?.filePaths).toEqual(['a.ts', 'b.ts'])
    expect(transcript.find(message => message.role === 'toolResult')).toMatchObject({ isError: true })
  })

  it(`steers exactly once when the turn count reaches ${STEER_TURN}`, async () => {
    faux.setResponses([...Array.from({ length: STEER_TURN + 1 }, () => read('a.ts')), submit(oneGroup('a.ts'))])

    const { transcript } = await analyze(diffWithFiles(file('a.ts')))

    expect(steeringCount(transcript)).toBe(1)
    const assistantTurnsBeforeSteer = transcript.slice(0, transcript.findIndex(message => message.role === 'user' && message.content === STEERING_TEXT))
      .filter(message => message.role === 'assistant')
    expect(assistantTurnsBeforeSteer).toHaveLength(STEER_TURN)
  })

  it('steers once the read budget is exhausted', async () => {
    const big = 'x'.repeat(41_000)
    const paths = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']
    faux.setResponses([...paths.slice(0, 5).map(path => read(path)), submit(oneGroup(...paths))])

    const { transcript } = await analyze(diffWithFiles(...paths.map(path => file(path, big))))

    expect(steeringCount(transcript)).toBe(1)
    expect(transcript.at(-3)).toMatchObject({ role: 'user', content: STEERING_TEXT })
  })

  it(`rejects when the model does not submit within ${MAX_TURNS} turns`, async () => {
    faux.setResponses(Array.from({ length: MAX_TURNS + 3 }, () => read('a.ts')))

    await expect(analyze(diffWithFiles(file('a.ts')))).rejects.toThrow('Agent did not submit a grouping')
    expect(faux.state.callCount).toBe(MAX_TURNS)
  })

  it('nudges once when the model replies with text instead of submitting', async () => {
    faux.setResponses([fauxAssistantMessage('Here is my grouping.'), submit(oneGroup('a.ts'))])

    const { result, transcript } = await analyze(diffWithFiles(file('a.ts')))

    expect(result.groups[0]?.filePaths).toEqual(['a.ts'])
    expect(transcript.filter(message => message.role === 'user' && message.content === 'Call submit_grouping now.')).toHaveLength(1)
  })

  it('rejects when the model replies with text again after the nudge', async () => {
    faux.setResponses([fauxAssistantMessage('Here is my grouping.'), fauxAssistantMessage('Still thinking.'), submit(oneGroup('a.ts'))])

    await expect(analyze(diffWithFiles(file('a.ts')))).rejects.toThrow('Agent did not submit a grouping')
    expect(faux.state.callCount).toBe(2)
  })

  it('rejects with the provider error message', async () => {
    faux.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'rate limited' })])

    await expect(analyze(diffWithFiles(file('a.ts')))).rejects.toThrow('rate limited')
  })

  it('rejects with an AbortError when aborted before the request', async () => {
    const controller = new AbortController()
    controller.abort()
    faux.setResponses([submit(oneGroup('a.ts'))])

    await expect(analyze(diffWithFiles(file('a.ts')), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects with an AbortError when aborted mid-stream', async () => {
    const controller = new AbortController()
    faux.setResponses([() => {
      controller.abort()
      return submit(oneGroup('a.ts'))
    }])

    await expect(analyze(diffWithFiles(file('a.ts')), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports progress per step', async () => {
    const progress: AnalyzeProgress[] = []
    faux.setResponses([read('a.ts', 'b.ts'), read('a.ts'), submit(oneGroup('a.ts', 'b.ts'))])

    await analyze(diffWithFiles(file('a.ts'), file('b.ts')), { onProgress: p => progress.push(p) })

    expect(progress).toEqual([
      { step: 1, kind: 'thinking' },
      { step: 1, kind: 'reading', paths: ['a.ts', 'b.ts'] },
      { step: 2, kind: 'thinking' },
      { step: 2, kind: 'reading', paths: ['a.ts'] },
      { step: 3, kind: 'thinking' },
      { step: 3, kind: 'organizing' },
    ])
  })

  it('streams the growing transcript while the run is in progress, ending on the full one', async () => {
    const snapshots: AgentMessage[][] = []
    faux.setResponses([read('a.ts'), submit(oneGroup('a.ts'))])

    const { transcript } = await analyze(diffWithFiles(file('a.ts')), { onTranscript: messages => snapshots.push(messages) })

    expect(snapshots.length).toBeGreaterThan(1)
    for (let i = 1; i < snapshots.length; i++)
      expect(snapshots[i]!.length).toBeGreaterThanOrEqual(snapshots[i - 1]!.length)
    expect(snapshots.at(-1)).toEqual(transcript)
  })
})

describe('reconcile', () => {
  it('keeps nested children', async () => {
    faux.setResponses([submit({
      overallSummary: 'Adds a feature.',
      groups: [{ key: 'feature', label: 'Feature', category: 'core', filePaths: [], children: [{ key: 'feature/core', label: 'Core', category: 'core', filePaths: ['a.ts'] }] }],
    })])

    const result = (await analyze(diffWithFiles(file('a.ts')))).result

    expect(result.groups[0]?.children?.[0]?.filePaths).toEqual(['a.ts'])
  })

  it('drops hallucinated and duplicated paths, leaving omitted files for the view to surface', async () => {
    const analysis: Analysis = {
      overallSummary: 'Summary.',
      groups: [
        { key: 'code', label: 'Code', category: 'core', filePaths: ['a.ts', 'made-up.ts'] },
        { key: 'more', label: 'More', category: 'core', filePaths: ['a.ts'] },
      ],
    }
    faux.setResponses([submit(analysis), submit(analysis)])

    const result = (await analyze(diffWithFiles(file('a.ts'), file('b.ts')))).result

    expect(result.groups).toEqual([
      { key: 'code', label: 'Code', category: 'core', filePaths: ['a.ts'], children: undefined },
    ])
  })
})
