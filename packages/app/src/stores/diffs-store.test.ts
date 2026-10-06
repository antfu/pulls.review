import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { CacheRepositories } from '@pulls.review/core/cache'
import type { DiffSource, DiffsPayload } from '@pulls.review/core/types'
import type { LlmRunner } from '../analyze/llm-runner'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { createPasteSource } from '@pulls.review/core/paste'
import { serializeRef } from '@pulls.review/core/types'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoRefresh } from '../state/auto-refresh'
import { createDiffsStore } from './diffs-store'

let cache: CacheRepositories

const runLlmAnalysisMock = vi.fn()
/** The store's model runner, standing in for the browser's pi loop. */
const llm: LlmRunner = { isSetup: () => true, analyze: runLlmAnalysisMock, chat: vi.fn() }

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
    const seed = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    await seed.load()
    await cache.diffs.setChangedSinceReviewed(serializeRef(seed.diff!.ref), ['a.ts'])

    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    await store.load()
    const sha = store.diff!.files[0]!.sha
    expect(store.changedSinceReviewed).toEqual(new Set(['a.ts']))
    expect(store.reviewed.has(sha)).toBe(false)

    await store.setReviewed([sha], true)
    expect(store.reviewed.has(sha)).toBe(true)
    expect(store.changedSinceReviewed.size).toBe(0)
    expect((await cache.diffs.get(serializeRef(store.diff!.ref)))!.changedSinceReviewed).toEqual([])
  })
})

describe('createDiffsStore llm session/progress/error', () => {
  it('stores the result and session on a successful analysis, with chatStartIndex at the transcript end', async () => {
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    await store.load()

    const result = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: new Date().toISOString() }
    runLlmAnalysisMock.mockResolvedValue({ result, transcript: transcript() })

    await store.llm!.reanalyze()

    expect(store.llm!.error).toBeUndefined()
    expect(store.grouped?.source).toBe('llm')

    const entry = await cache.diffs.get(serializeRef(store.diff!.ref))
    expect((entry as any).analyzedBy.llm).toEqual(result)
    expect((entry as any).llmSession.chatStartIndex).toBe(transcript().length)
    expect((entry as any).llmSession.messages).toHaveLength(transcript().length)
  })

  it('sets llm.error and leaves analyzedBy.llm/cache untouched on failure', async () => {
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    await store.load()

    runLlmAnalysisMock.mockRejectedValue(new Error('boom'))
    await store.llm!.reanalyze()

    expect(store.llm!.error?.message).toBe('boom')
    expect(store.grouped?.source).not.toBe('llm')

    const entry = await cache.diffs.get(serializeRef(store.diff!.ref)) as any
    expect(entry.analyzedBy.llm).toBeUndefined()
    expect(entry.llmSession).toBeUndefined()
  })

  it('surfaces progress during the run and clears it afterwards', async () => {
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
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
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
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
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
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
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    await store.load()

    expect(store.grouped?.source).toBe('rule-based')
    const entry = await cache.diffs.get(serializeRef(store.diff!.ref)) as any
    expect(entry.analyzedBy).toEqual({})
  })

  it('discards an in-flight analysis on refresh but keeps the last stored result and session', async () => {
    const store = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
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
    const entry = await cache.diffs.get(serializeRef(store.diff!.ref)) as any
    expect(entry.analyzedBy.llm).toEqual(stored)
    expect(entry.llmSession.chatStartIndex).toBe(transcript().length)
  })
})

/** A source whose head can be moved between loads, standing in for any live source. */
function fakeSource(head: { sha: string }): DiffSource & { fetches: number } {
  const source = {
    fetches: 0,
    key: async () => 'fake:1',
    fetch: async (): Promise<DiffsPayload> => {
      source.fetches++
      return { ref: { kind: 'paste', hash: 'fake' }, title: `at ${head.sha}`, head: { sha: head.sha, ref: 'main' }, files: [] }
    },
    fingerprint: async () => head.sha,
  }
  return source
}

async function settle() {
  for (let i = 0; i < 10; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
}

describe('createDiffsStore over any source', () => {
  afterEach(() => {
    autoRefresh.value = false
  })

  it('serves a cached diff and flags it stale when the source fingerprint moves', async () => {
    const head = { sha: 'a' }
    const source = fakeSource(head)
    await createDiffsStore(source, { cache, llm }).load()

    head.sha = 'b'
    const store = createDiffsStore(source, { cache, llm })
    await store.load()
    await settle()

    expect(source.fetches).toBe(1)
    expect(store.diff?.title).toBe('at a')
    expect(store.isStale).toBe(true)

    await store.refresh()
    expect(store.diff?.title).toBe('at b')
    expect(store.isStale).toBe(false)
  })

  it('never checks staleness for a source without a fingerprint', async () => {
    const { fingerprint: _, ...source } = fakeSource({ sha: 'a' })
    await createDiffsStore(source, { cache, llm }).load()
    const store = createDiffsStore(source, { cache, llm })
    await store.load()
    await settle()
    expect(store.isStale).toBe(false)
  })

  it('loads full file content through the source once, then from the cache', async () => {
    const loads: string[] = []
    const source: DiffSource = {
      ...fakeSource({ sha: 'head' }),
      fetch: async () => ({ ref: { kind: 'paste', hash: 'fake' }, title: 't', base: { sha: 'base', ref: 'main' }, head: { sha: 'head', ref: 'f' }, files: [] }),
      loadFile: async (path, sha) => {
        loads.push(`${sha}:${path}`)
        return `${path}@${sha}`
      },
    }
    const store = createDiffsStore(source, { cache, llm })
    await store.load()
    const renamed = { path: 'new.ts', previousPath: 'old.ts', status: 'renamed' as const, additions: 0, deletions: 0, isBinary: false, sha: 's', hunks: [] }

    expect(await store.fileContent!.load(renamed)).toEqual({ old: 'old.ts@base', new: 'new.ts@head' })
    expect(await store.fileContent!.load(renamed)).toEqual({ old: 'old.ts@base', new: 'new.ts@head' })
    expect(await store.fileContent!.load({ ...renamed, path: 'added.ts', status: 'added' })).toEqual({ old: undefined, new: 'added.ts@head' })
    expect(loads).toEqual(['base:old.ts', 'head:new.ts', 'head:added.ts'])
  })

  it('offers no full file content for a source that cannot load files', () => {
    expect(createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm }).fileContent).toBeUndefined()
  })

  it('can refresh only a source with a fingerprint, and names the credential the source asks for', () => {
    const live = createDiffsStore({ ...fakeSource({ sha: 'a' }), auth: 'github-token' }, { cache, llm })
    const paste = createDiffsStore(createPasteSource(PATCH_TEXT), { cache, llm })
    expect([live.canRefresh, live.auth]).toEqual([true, 'github-token'])
    expect([paste.canRefresh, paste.auth]).toEqual([false, undefined])
  })

  it('offers no review threads or shared analyses for a source that is not a GitHub PR', () => {
    const store = createDiffsStore(fakeSource({ sha: 'a' }), { cache, llm })
    expect(store.reviews).toBeUndefined()
    expect(store.shared).toBeUndefined()
  })
})

describe('createDiffsStore credentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a token saved after the store was created on the next refresh', async () => {
    const pr = { title: 'PR', body: '', user: null, base: { ref: 'main', sha: 'b' }, head: { ref: 'f', sha: 'h' }, created_at: '', updated_at: '', html_url: '', state: 'open', draft: false, merged: false }
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => new Response(JSON.stringify(url.endsWith('/pulls/1') ? pr : []), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    let token: string | undefined
    const credentials = { githubToken: async () => token }
    const store = createDiffsStore(createGithubPullRequestSource({ owner: 'o', repo: 'r', number: '1' }, credentials), { cache, llm })

    await store.load()
    token = 'saved-later'
    fetchMock.mockClear()
    await store.refresh()
    await settle()

    const prRequest = fetchMock.mock.calls.find(([url]) => url.endsWith('/pulls/1'))
    expect(new Headers(prRequest![1].headers).get('Authorization')).toBe('Bearer saved-later')
  })
})
