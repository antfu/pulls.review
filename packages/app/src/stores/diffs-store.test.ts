import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { CacheRepositories } from '@pulls.review/core/cache'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiffsStore } from './diffs-store'

let cache: CacheRepositories

const mocks = vi.hoisted(() => ({
  runLlmAnalysis: vi.fn(),
}))

vi.mock('../analyze/adapters/llm', () => ({
  llmAdapter: { id: 'llm', available: true, analyze: vi.fn() },
  runLlmAnalysis: mocks.runLlmAnalysis,
}))

const runLlmAnalysisMock = mocks.runLlmAnalysis

const PATCH_TEXT = `diff --git a/a.ts b/a.ts\nindex 000..111 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n`

function transcript(): AgentMessage[] {
  return [
    { role: 'user', content: 'analyze', timestamp: 0 },
    { role: 'user', content: 'done', timestamp: 1 },
  ]
}

beforeEach(() => {
  cache = createCacheRepositories(createStorage({ driver: memoryDriver() }))
  runLlmAnalysisMock.mockReset()
})

describe('createDiffsStore review marks', () => {
  it('loads the changed-since-reviewed flags from the cache and clears them on marking', async () => {
    const seed = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await seed.load()
    await cache.diffs.setChangedSinceReviewed(seed.diff!.id, ['a.ts'])

    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()
    const sha = store.diff!.files[0]!.sha
    expect(store.changedSinceReviewed).toEqual(new Set(['a.ts']))
    expect(store.reviewed.has(sha)).toBe(false)

    await store.setReviewed([sha], true)
    expect(store.reviewed.has(sha)).toBe(true)
    expect(store.changedSinceReviewed.size).toBe(0)
    expect((await cache.diffs.get(store.diff!.id))!.changedSinceReviewed).toEqual([])
  })
})

describe('createDiffsStore llm session/progress/error', () => {
  it('stores the result and session on a successful analysis, with chatStartIndex at the transcript end', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    const result = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }
    runLlmAnalysisMock.mockResolvedValue({ result, transcript: transcript() })

    await store.llm!.reanalyze()

    expect(store.llm!.error).toBeUndefined()
    expect(store.grouped?.source).toBe('llm')

    const entry = await cache.diffs.get(store.diff!.id)
    expect((entry as any).analyzedBy.llm).toEqual(result)
    expect((entry as any).llmSession.chatStartIndex).toBe(transcript().length)
    expect((entry as any).llmSession.messages).toHaveLength(transcript().length)
  })

  it('sets llm.error and leaves analyzedBy.llm/cache untouched on failure', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    runLlmAnalysisMock.mockRejectedValue(new Error('boom'))
    await store.llm!.reanalyze()

    expect(store.llm!.error?.message).toBe('boom')
    expect(store.grouped?.source).not.toBe('llm')

    const entry = await cache.diffs.get(store.diff!.id) as any
    expect(entry.analyzedBy.llm).toBeUndefined()
    expect(entry.llmSession).toBeUndefined()
  })

  it('surfaces progress during the run and clears it afterwards', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    let capturedProgress: unknown
    runLlmAnalysisMock.mockImplementation(async (_diff: unknown, options: { onProgress?: (p: unknown) => void }) => {
      options.onProgress?.({ step: 1, kind: 'thinking' })
      capturedProgress = store.llm!.progress
      return { result: { source: 'llm', groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }, transcript: transcript() }
    })

    await store.llm!.reanalyze()

    expect(capturedProgress).toEqual({ step: 1, message: 'Thinking… (step 1)' })
    expect(store.llm!.progress).toBeUndefined()
  })

  it('surfaces the transcript live and keeps it alongside the error when the run fails', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    let capturedTranscript: AgentMessage[] | undefined
    runLlmAnalysisMock.mockImplementation(async (_diff: unknown, options: { onTranscript?: (m: AgentMessage[]) => void }) => {
      options.onTranscript?.(transcript().slice(0, 1))
      capturedTranscript = store.llm!.transcript
      options.onTranscript?.(transcript())
      throw new Error('boom')
    })

    await store.llm!.reanalyze()

    expect(capturedTranscript).toHaveLength(1)
    expect(store.llm!.transcript).toEqual(transcript())
    expect(store.llm!.error?.message).toBe('boom')

    runLlmAnalysisMock.mockImplementation(() => new Promise(() => {}))
    void store.llm!.reanalyze()
    expect(store.llm!.transcript).toEqual([])
    expect(store.llm!.error).toBeUndefined()
  })

  it('leaves llm.error unset when the run is aborted through llm.abort', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    runLlmAnalysisMock.mockImplementation((_diff: unknown, options: { signal: AbortSignal }) =>
      new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))

    const running = store.llm!.reanalyze()
    expect(store.llm!.isAnalyzing).toBe(true)
    store.llm!.abort()
    await running

    expect(store.llm!.isAnalyzing).toBe(false)
    expect(store.llm!.error).toBeUndefined()
  })

  it('never persists the rule-based result, recomputing it from the diff instead', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    expect(store.grouped?.source).toBe('rule-based')
    const entry = await cache.diffs.get(store.diff!.id) as any
    expect(entry.analyzedBy).toEqual({})
  })

  it('discards an in-flight analysis on refresh but keeps the last stored result and session', async () => {
    const store = createDiffsStore({ kind: 'patch-text', text: PATCH_TEXT }, { cache })
    await store.load()

    const stored = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }
    runLlmAnalysisMock.mockResolvedValue({ result: stored, transcript: transcript() })
    await store.llm!.reanalyze()

    let signal: AbortSignal | undefined
    let resolveRun!: (value: unknown) => void
    runLlmAnalysisMock.mockImplementation((_diff: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise(resolve => resolveRun = resolve)
    })

    const running = store.llm!.reanalyze()
    await store.refresh()
    resolveRun({ result: { ...stored, generatedAt: 'later' }, transcript: transcript() })
    await running

    expect(signal?.aborted).toBe(true)
    expect(store.aiResult).toEqual(stored)
    expect(store.llm!.chat.available).toBe(true)
    const entry = await cache.diffs.get(store.diff!.id) as any
    expect(entry.analyzedBy.llm).toEqual(stored)
    expect(entry.llmSession.chatStartIndex).toBe(transcript().length)
  })
})
