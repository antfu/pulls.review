import type { AgentMessage } from '@earendil-works/pi-agent-core'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheStorage } from '../cache/storage'
import { createDiffsStore } from './diffs-store'

const mocks = vi.hoisted(() => ({
  runLlmAnalysis: vi.fn(),
  storage: undefined as ReturnType<typeof createCacheStorage> | undefined,
}))

vi.mock('../analyze/adapters/llm', () => ({
  llmAdapter: { id: 'llm', available: true, analyze: vi.fn() },
  runLlmAnalysis: mocks.runLlmAnalysis,
}))

vi.mock('../cache/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/storage')>()
  return { ...actual, getDefaultCacheStorage: async () => mocks.storage }
})

const runLlmAnalysisMock = mocks.runLlmAnalysis

const PATCH_TEXT = `diff --git a/a.ts b/a.ts\nindex 000..111 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n`

function transcript(): AgentMessage[] {
  return [
    { role: 'user', content: 'analyze', timestamp: 0 },
    { role: 'user', content: 'done', timestamp: 1 },
  ]
}

beforeEach(() => {
  mocks.storage = createCacheStorage(memoryDriver())
  runLlmAnalysisMock.mockReset()
})

describe('createDiffsStore llm session/progress/error', () => {
  it('stores the result and session on a successful analysis, with chatStartIndex at the transcript end', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT })
    await store.load()

    const result = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }
    runLlmAnalysisMock.mockResolvedValue({ result, transcript: transcript() })

    await store.llm!.reanalyze()

    expect(store.llm!.error).toBeUndefined()
    expect(store.grouped?.source).toBe('llm')

    const entry = await mocks.storage!.getItem(`pr:${store.diff!.id}`)
    expect((entry as any).analyzedBy.llm).toEqual(result)
    expect((entry as any).llmSession.chatStartIndex).toBe(transcript().length)
    expect((entry as any).llmSession.messages).toHaveLength(transcript().length)
  })

  it('sets llm.error and leaves analyzedBy.llm/cache untouched on failure', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT })
    await store.load()

    runLlmAnalysisMock.mockRejectedValue(new Error('boom'))
    await store.llm!.reanalyze()

    expect(store.llm!.error?.message).toBe('boom')
    expect(store.grouped?.source).not.toBe('llm')

    const entry = await mocks.storage!.getItem(`pr:${store.diff!.id}`) as any
    expect(entry.analyzedBy.llm).toBeUndefined()
    expect(entry.llmSession).toBeUndefined()
  })

  it('surfaces progress during the run and clears it afterwards', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT })
    await store.load()

    let capturedProgress: unknown
    runLlmAnalysisMock.mockImplementation(async (_diff: unknown, options: { onProgress?: (p: unknown) => void }) => {
      options.onProgress?.({ step: 1, message: 'Thinking…' })
      capturedProgress = store.llm!.progress
      return { result: { source: 'llm', groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }, transcript: transcript() }
    })

    await store.llm!.reanalyze()

    expect(capturedProgress).toEqual({ step: 1, message: 'Thinking…' })
    expect(store.llm!.progress).toBeUndefined()
  })

  it('leaves llm.error unset when the run is aborted', async () => {
    const OriginalAbortController = globalThis.AbortController
    let captured: AbortController | undefined
    function CapturingAbortController(this: AbortController) {
      const controller = new OriginalAbortController()
      captured = controller
      return controller
    }
    vi.stubGlobal('AbortController', CapturingAbortController)

    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT })
    await store.load()

    runLlmAnalysisMock.mockImplementation(async () => {
      captured!.abort()
      throw new DOMException('Aborted', 'AbortError')
    })

    await store.llm!.reanalyze()

    expect(store.llm!.error).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('discards an in-flight analysis when the diff is refreshed', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT })
    await store.load()

    let signal: AbortSignal | undefined
    let resolveRun!: (value: unknown) => void
    runLlmAnalysisMock.mockImplementation((_diff: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise(resolve => resolveRun = resolve)
    })

    const running = store.llm!.reanalyze()
    await store.refresh()
    resolveRun({ result: { source: 'llm', groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }, transcript: transcript() })
    await running

    expect(signal?.aborted).toBe(true)
    expect(store.aiResult).toBeUndefined()
    expect(store.llm!.chat.available).toBe(false)
    const entry = await mocks.storage!.getItem(`pr:${store.diff!.id}`) as any
    expect(entry.analyzedBy.llm).toBeUndefined()
    expect(entry.llmSession).toBeUndefined()
  })
})
