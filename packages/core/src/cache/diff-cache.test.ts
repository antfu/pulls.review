import type { Driver, Storage } from 'unstorage'
import type { CacheBudget } from './diff-cache'
import type { LlmSession, PrCacheEntry } from './schema'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { computeEntrySizeBytes, createDiffCache } from './diff-cache'
import { createReviewMarks } from './review-marks'

let storage: Storage
let reads: string[]

function cacheWith(budget?: CacheBudget) {
  const marks = createReviewMarks(storage)
  return { cache: createDiffCache(storage, marks, budget), marks }
}

function makeEntry(key: string, sha: string, lastViewedAt: number, sizeBytes = 100): PrCacheEntry {
  const diff: PrCacheEntry['diff'] = {
    ref: { kind: 'paste', hash: key },
    title: 't',
    description: '',
    files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, isBinary: false, sha, hunks: [] }],
  }
  return { key, diff, headSha: sha, analyzedBy: {}, lastViewedAt, sizeBytes }
}

const session: LlmSession = { messages: [{ role: 'user', content: 'hi', timestamp: 0 }], chatStartIndex: 1 }

beforeEach(() => {
  // Records every key read, so tests can assert which documents an operation touched.
  const base = memoryDriver()
  reads = []
  const recording: Driver = { ...base, getItem: (key, opts) => {
    reads.push(key)
    return base.getItem(key, opts)
  } }
  storage = createStorage({ driver: recording })
})

describe('diff cache', () => {
  it('round-trips an entry', async () => {
    const { cache } = cacheWith()
    const entry = makeEntry('a', 'sha-a', Date.now())
    await cache.put(entry)
    expect(await cache.get('a')).toEqual(entry)
  })

  it('returns undefined for a missing entry', async () => {
    expect(await cacheWith().cache.get('missing')).toBeUndefined()
  })

  it('treats a corrupt half as a cache miss', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-a', 1000))
    await storage.setItem('pr-body:a', { totally: 'not a valid body' })
    expect(await cache.get('a')).toBeUndefined()
  })

  it('strips a previously persisted rule-based result instead of rejecting the entry', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-a', Date.now()))
    const legacyResult = { source: 'rule-based', groups: [], schemaVersion: 1, generatedAt: 'then' }
    const body = await storage.getItem<Record<string, unknown>>('pr-body:a')
    await storage.setItem('pr-body:a', { ...body, analyzedBy: { 'rule-based': legacyResult } })
    expect((await cache.get('a'))?.analyzedBy).toEqual({})
  })

  it('drops entries from before the meta/body split', async () => {
    const { cache } = cacheWith()
    await storage.setItem('pr:github:o/r#1', makeEntry('github:o/r#1', 'sha', 0))
    await cache.put(makeEntry('a', 'sha-a', 1000))
    expect(await storage.getKeys('pr:')).toEqual([])
  })

  it('putDiff replaces the diff while keeping the AI result, session, reviews and shared comment', async () => {
    const { cache } = cacheWith()
    const entry = makeEntry('a', 'sha-old', 1000)
    const llm = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: 'then' }
    const sharedComment = { id: 7, url: 'https://example.com/7' }
    await cache.put({ ...entry, analyzedBy: { llm }, sharedComment })
    await cache.setLlmSession('a', session)

    const newDiff = { ...entry.diff, files: [{ ...entry.diff.files[0]!, sha: 'sha-new' }] }
    await cache.putDiff('a', newDiff, 'sha-new')

    const back = await cache.get('a')
    expect(back!.diff).toEqual(newDiff)
    expect(back!.headSha).toBe('sha-new')
    expect(back!.analyzedBy.llm).toEqual(llm)
    expect(back!.llmSession?.chatStartIndex).toBe(1)
    expect(back!.sharedComment).toEqual(sharedComment)
    expect(back!.lastViewedAt).toBeGreaterThan(1000)
  })

  it('putDiff flags a reviewed file whose sha changed, and keeps the flag until it is cleared', async () => {
    const { cache, marks } = cacheWith()
    const entry = makeEntry('a', 'sha-1', 1000)
    await cache.put(entry)
    await marks.set(['sha-1'], true)

    const file = entry.diff.files[0]!
    const revised = { ...entry.diff, files: [{ ...file, sha: 'sha-2' }, { ...file, path: 'b.ts', sha: 'sha-b' }] }
    await cache.putDiff('a', revised, 'sha-2')
    expect((await cache.get('a'))!.changedSinceReviewed).toEqual(['a.ts'])

    // Further commits don't clear the flag; a file leaving the diff drops it.
    await cache.putDiff('a', { ...revised, files: [{ ...file, sha: 'sha-3' }] }, 'sha-3')
    expect((await cache.get('a'))!.changedSinceReviewed).toEqual(['a.ts'])

    await cache.setChangedSinceReviewed('a', [])
    await cache.putDiff('a', { ...revised, files: [{ ...file, sha: 'sha-4' }] }, 'sha-4')
    expect((await cache.get('a'))!.changedSinceReviewed).toEqual([])
  })

  it('putDiff does not flag unreviewed or unchanged files', async () => {
    const { cache, marks } = cacheWith()
    const entry = makeEntry('a', 'sha-1', 1000)
    await cache.put(entry)
    const file = entry.diff.files[0]!
    await cache.putDiff('a', { ...entry.diff, files: [{ ...file, sha: 'sha-2' }] }, 'sha-2')
    expect((await cache.get('a'))!.changedSinceReviewed).toEqual([])

    await marks.set(['sha-2'], true)
    await cache.putDiff('a', { ...entry.diff, files: [{ ...file, sha: 'sha-2' }] }, 'sha-2')
    expect((await cache.get('a'))!.changedSinceReviewed).toEqual([])
  })

  it('putDiff creates the entry when none exists', async () => {
    const { cache } = cacheWith()
    await cache.putDiff('a', makeEntry('a', 'sha-a', 0).diff, 'sha-a')
    const back = await cache.get('a')
    expect(back?.analyzedBy).toEqual({})
    expect(back?.sizeBytes).toBeGreaterThan(0)
  })

  it('touch bumps lastViewedAt', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-a', 1000))
    const before = Date.now()
    await cache.touch('a')
    expect((await cache.get('a'))!.lastViewedAt).toBeGreaterThanOrEqual(before)
  })

  it('keeps both of two overlapping updates to one entry', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-a', 1000))
    const llm = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: 'now' }
    const reviews = { threads: [], summaries: [], pendingReview: undefined }
    await Promise.all([
      cache.setReviewData('a', reviews),
      cache.setAnalyzedResult('a', 'llm', llm),
      cache.setLlmSession('a', session),
      cache.setSharedComment('a', { id: 1, url: 'u' }),
    ])
    const back = await cache.get('a')
    expect(back!.reviews).toEqual(reviews)
    expect(back!.analyzedBy.llm).toEqual(llm)
    expect(back!.llmSession).toEqual(session)
    expect(back!.sharedComment).toEqual({ id: 1, url: 'u' })
  })

  it('evicts the least-recently-viewed entries once the entry-count budget is exceeded', async () => {
    const { cache } = cacheWith({ maxEntries: 2 })
    await cache.put(makeEntry('old', 'sha-old', 1000))
    await cache.put(makeEntry('mid', 'sha-mid', 2000))
    await cache.put(makeEntry('new', 'sha-new', 3000))

    expect(await cache.get('old')).toBeUndefined()
    expect(await cache.get('mid')).toBeDefined()
    expect(await cache.get('new')).toBeDefined()
    expect(await storage.getKeys('pr-body')).toHaveLength(2)
  })

  it('evicts once the byte budget is exceeded, even under the entry-count budget', async () => {
    const { cache } = cacheWith({ maxBytes: 100, maxEntries: 50 })
    await cache.put(makeEntry('old', 'sha-old', 1000, 60))
    await cache.put(makeEntry('new', 'sha-new', 2000, 60))

    expect(await cache.get('old')).toBeUndefined()
    expect(await cache.get('new')).toBeDefined()
  })

  it('never reads a diff body while evicting or listing recent entries', async () => {
    const { cache } = cacheWith({ maxEntries: 1 })
    await cache.put(makeEntry('old', 'sha-old', 1000))
    reads = []
    await cache.put(makeEntry('new', 'sha-new', 2000))
    await cache.listRecent(10)
    expect(reads.some(key => key.startsWith('pr-body'))).toBe(false)
  })

  it('prunes orphaned review marks after an eviction, but keeps marks still referenced', async () => {
    const { cache, marks } = cacheWith({ maxEntries: 1 })
    await marks.set(['sha-old', 'sha-new'], true)
    await cache.put(makeEntry('old', 'sha-old', 1000))
    await cache.put(makeEntry('new', 'sha-new', 2000))

    expect(await marks.get(['sha-old', 'sha-new'])).toEqual(new Set(['sha-new']))
  })

  it('listRecent returns metadata most-recently-viewed first, capped at the limit', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('old', 'sha-old', 1000))
    await cache.put(makeEntry('mid', 'sha-mid', 2000))
    await cache.put(makeEntry('new', 'sha-new', 3000))

    const recent = await cache.listRecent(10)
    expect(recent.map(meta => meta.key)).toEqual(['new', 'mid', 'old'])
    expect(recent[0]).toMatchObject({ title: 't', additions: 1, deletions: 0, fileShas: ['sha-new'] })
    expect((await cache.listRecent(2)).map(meta => meta.key)).toEqual(['new', 'mid'])
  })

  it('listMatching returns only the entries whose metadata matches', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-1', 1000))
    await cache.put(makeEntry('b', 'sha-2', 2000))
    await cache.put(makeEntry('c', 'sha-3', 3000))

    expect((await cache.listMatching(meta => meta.key !== 'b')).map(entry => entry.key).sort()).toEqual(['a', 'c'])
  })

  it('computeEntrySizeBytes counts the llmSession toward the size', () => {
    const entry = makeEntry('a', 'sha-a', 0)
    expect(computeEntrySizeBytes(entry.diff, entry.analyzedBy, session)).toBeGreaterThan(computeEntrySizeBytes(entry.diff, entry.analyzedBy))
  })

  it('setLlmSession is a no-op when the entry is missing', async () => {
    const { cache } = cacheWith()
    await cache.setLlmSession('missing', { messages: [], chatStartIndex: 0 })
    expect(await cache.get('missing')).toBeUndefined()
  })

  it('setLlmSession writes and clears the session, updating sizeBytes', async () => {
    const { cache } = cacheWith()
    const entry = makeEntry('a', 'sha-a', 1000)
    await cache.put(entry)
    await cache.setLlmSession('a', session)
    const withSession = await cache.get('a')
    expect(withSession!.llmSession).toEqual(session)
    expect(withSession!.sizeBytes).toBeGreaterThan(entry.sizeBytes)

    await cache.setLlmSession('a', undefined)
    const cleared = await cache.get('a')
    expect(cleared!.llmSession).toBeUndefined()
    expect(cleared!.sizeBytes).toBe(computeEntrySizeBytes(entry.diff, entry.analyzedBy))
  })

  it('an entry rewritten via put without the field has no session', async () => {
    const { cache } = cacheWith()
    await cache.put(makeEntry('a', 'sha-a', 1000))
    await cache.setLlmSession('a', session)
    await cache.put(makeEntry('a', 'sha-a', 2000))
    expect((await cache.get('a'))!.llmSession).toBeUndefined()
  })
})
