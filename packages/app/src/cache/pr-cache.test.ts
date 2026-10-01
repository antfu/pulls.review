import type { LlmSession, PrCacheEntry } from '../types/cache'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { computeEntrySizeBytes, enforceBudget, getEntry, listRecentEntries, listRepoEntries, putDiff, putEntry, setChangedSinceReviewed, setLlmSession, touchEntry } from './pr-cache'
import { getReviewed, setReviewed } from './review-cache'
import { createCacheStorage } from './storage'

let storage: ReturnType<typeof createCacheStorage>

function makeEntry(key: string, sha: string, lastViewedAt: number, sizeBytes = 100): PrCacheEntry {
  const diff: PrCacheEntry['diff'] = {
    provider: 'github',
    id: key,
    title: 't',
    description: '',
    files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, isBinary: false, sha, hunks: [] }],
  }
  return { key, diff, headSha: sha, analyzedBy: {}, lastViewedAt, sizeBytes }
}

beforeEach(() => {
  storage = createCacheStorage(memoryDriver())
})

describe('pr-cache', () => {
  it('round-trips an entry', async () => {
    const entry = makeEntry('a', 'sha-a', Date.now())
    await putEntry(storage, entry)
    const back = await getEntry(storage, 'a')
    expect(back).toEqual(entry)
  })

  it('returns undefined for a missing entry', async () => {
    expect(await getEntry(storage, 'missing')).toBeUndefined()
  })

  it('treats a corrupt/previous-shape entry as a cache miss', async () => {
    await storage.setItem('pr:bad', { totally: 'not a valid entry' })
    expect(await getEntry(storage, 'bad')).toBeUndefined()
  })

  it('strips a previously persisted rule-based result instead of rejecting the entry', async () => {
    const entry = makeEntry('a', 'sha-a', Date.now())
    const legacyResult = { source: 'rule-based', groups: [], schemaVersion: 1, generatedAt: 'then' }
    await storage.setItem('pr:a', { ...entry, analyzedBy: { 'rule-based': legacyResult } })
    const back = await getEntry(storage, 'a')
    expect(back?.analyzedBy).toEqual({})
  })

  it('putDiff replaces the diff while keeping the AI result, session, reviews and shared comment', async () => {
    const entry = makeEntry('a', 'sha-old', 1000)
    const llm = { source: 'llm' as const, groups: [], schemaVersion: 1, generatedAt: 'then' }
    const sharedComment = { id: 7, url: 'https://example.com/7' }
    await putEntry(storage, { ...entry, analyzedBy: { llm }, sharedComment })
    await setLlmSession(storage, 'a', { messages: [{ role: 'user', content: 'hi', timestamp: 0 }], chatStartIndex: 1 })

    const newDiff = { ...entry.diff, files: [{ ...entry.diff.files[0]!, sha: 'sha-new' }] }
    await putDiff(storage, 'a', newDiff, 'sha-new')

    const back = await getEntry(storage, 'a')
    expect(back!.diff).toEqual(newDiff)
    expect(back!.headSha).toBe('sha-new')
    expect(back!.analyzedBy.llm).toEqual(llm)
    expect(back!.llmSession?.chatStartIndex).toBe(1)
    expect(back!.sharedComment).toEqual(sharedComment)
    expect(back!.lastViewedAt).toBeGreaterThan(1000)
  })

  it('putDiff flags a reviewed file whose sha changed, and keeps the flag until it is cleared', async () => {
    const entry = makeEntry('a', 'sha-1', 1000)
    await putEntry(storage, entry)
    await setReviewed(storage, ['sha-1'], true)

    const file = entry.diff.files[0]!
    const revised = { ...entry.diff, files: [{ ...file, sha: 'sha-2' }, { ...file, path: 'b.ts', sha: 'sha-b' }] }
    await putDiff(storage, 'a', revised, 'sha-2')
    expect((await getEntry(storage, 'a'))!.changedSinceReviewed).toEqual(['a.ts'])

    // Further commits don't clear the flag; a file leaving the diff drops it.
    await putDiff(storage, 'a', { ...revised, files: [{ ...file, sha: 'sha-3' }] }, 'sha-3')
    expect((await getEntry(storage, 'a'))!.changedSinceReviewed).toEqual(['a.ts'])

    await setChangedSinceReviewed(storage, 'a', [])
    await putDiff(storage, 'a', { ...revised, files: [{ ...file, sha: 'sha-4' }] }, 'sha-4')
    expect((await getEntry(storage, 'a'))!.changedSinceReviewed).toEqual([])
  })

  it('putDiff does not flag unreviewed or unchanged files', async () => {
    const entry = makeEntry('a', 'sha-1', 1000)
    await putEntry(storage, entry)
    const file = entry.diff.files[0]!
    await putDiff(storage, 'a', { ...entry.diff, files: [{ ...file, sha: 'sha-2' }] }, 'sha-2')
    expect((await getEntry(storage, 'a'))!.changedSinceReviewed).toEqual([])

    await setReviewed(storage, ['sha-2'], true)
    await putDiff(storage, 'a', { ...entry.diff, files: [{ ...file, sha: 'sha-2' }] }, 'sha-2')
    expect((await getEntry(storage, 'a'))!.changedSinceReviewed).toEqual([])
  })

  it('putDiff creates the entry when none exists', async () => {
    const entry = makeEntry('a', 'sha-a', 0)
    await putDiff(storage, 'a', entry.diff, 'sha-a')
    const back = await getEntry(storage, 'a')
    expect(back?.analyzedBy).toEqual({})
    expect(back?.sizeBytes).toBeGreaterThan(0)
  })

  it('touchEntry bumps lastViewedAt', async () => {
    const entry = makeEntry('a', 'sha-a', 1000)
    await putEntry(storage, entry)
    const before = Date.now()
    await touchEntry(storage, 'a')
    const back = await getEntry(storage, 'a')
    expect(back!.lastViewedAt).toBeGreaterThanOrEqual(before)
  })

  it('computeEntrySizeBytes returns a positive byte count', () => {
    const entry = makeEntry('a', 'sha-a', 0)
    expect(computeEntrySizeBytes(entry.diff, entry.analyzedBy)).toBeGreaterThan(0)
  })

  it('evicts the least-recently-viewed entries once the entry-count budget is exceeded', async () => {
    await putEntry(storage, makeEntry('old', 'sha-old', 1000), { maxEntries: 2 })
    await putEntry(storage, makeEntry('mid', 'sha-mid', 2000), { maxEntries: 2 })
    await putEntry(storage, makeEntry('new', 'sha-new', 3000), { maxEntries: 2 })

    expect(await getEntry(storage, 'old')).toBeUndefined()
    expect(await getEntry(storage, 'mid')).toBeDefined()
    expect(await getEntry(storage, 'new')).toBeDefined()
  })

  it('evicts once the byte budget is exceeded, even under the entry-count budget', async () => {
    await putEntry(storage, makeEntry('old', 'sha-old', 1000, 60), { maxBytes: 100, maxEntries: 50 })
    await putEntry(storage, makeEntry('new', 'sha-new', 2000, 60), { maxBytes: 100, maxEntries: 50 })

    expect(await getEntry(storage, 'old')).toBeUndefined()
    expect(await getEntry(storage, 'new')).toBeDefined()
  })

  it('prunes orphaned review marks after an eviction, but keeps marks still referenced', async () => {
    await setReviewed(storage, ['sha-old', 'sha-new'], true)
    await putEntry(storage, makeEntry('old', 'sha-old', 1000), { maxEntries: 1 })
    await putEntry(storage, makeEntry('new', 'sha-new', 2000), { maxEntries: 1 })

    const reviewed = await getReviewed(storage, ['sha-old', 'sha-new'])
    expect(reviewed).toEqual(new Set(['sha-new']))
  })

  it('listRecentEntries returns entries most-recently-viewed first, capped at the limit', async () => {
    await putEntry(storage, makeEntry('old', 'sha-old', 1000))
    await putEntry(storage, makeEntry('mid', 'sha-mid', 2000))
    await putEntry(storage, makeEntry('new', 'sha-new', 3000))

    expect((await listRecentEntries(storage, 10)).map(entry => entry.key)).toEqual(['new', 'mid', 'old'])
    expect((await listRecentEntries(storage, 2)).map(entry => entry.key)).toEqual(['new', 'mid'])
  })

  it('listRepoEntries returns only the entries of that repo', async () => {
    await putEntry(storage, makeEntry('github:o/r#1', 'sha-1', 1000))
    await putEntry(storage, makeEntry('github:o/r#2', 'sha-2', 2000))
    await putEntry(storage, makeEntry('github:o/r-other#3', 'sha-3', 3000))
    await putEntry(storage, makeEntry('paste:abc', 'sha-4', 4000))

    expect((await listRepoEntries(storage, 'o', 'r')).map(entry => entry.key).sort()).toEqual(['github:o/r#1', 'github:o/r#2'])
  })

  it('enforceBudget is a no-op when nothing exceeds the budget', async () => {
    await putEntry(storage, makeEntry('a', 'sha-a', 1000))
    await expect(enforceBudget(storage)).resolves.toBeUndefined()
    expect(await getEntry(storage, 'a')).toBeDefined()
  })

  it('computeEntrySizeBytes counts the llmSession toward the size', () => {
    const entry = makeEntry('a', 'sha-a', 0)
    const session: LlmSession = { messages: [{ role: 'user', content: 'hi', timestamp: 0 } as never], chatStartIndex: 1 }
    const withoutSession = computeEntrySizeBytes(entry.diff, entry.analyzedBy)
    const withSession = computeEntrySizeBytes(entry.diff, entry.analyzedBy, session)
    expect(withSession).toBeGreaterThan(withoutSession)
  })

  it('setLlmSession is a no-op when the entry is missing', async () => {
    await expect(setLlmSession(storage, 'missing', { messages: [], chatStartIndex: 0 })).resolves.toBeUndefined()
    expect(await getEntry(storage, 'missing')).toBeUndefined()
  })

  it('setLlmSession writes the session and updates sizeBytes', async () => {
    const entry = makeEntry('a', 'sha-a', 1000)
    await putEntry(storage, entry)
    const session: LlmSession = { messages: [{ role: 'user', content: 'hi', timestamp: 0 } as never], chatStartIndex: 1 }
    await setLlmSession(storage, 'a', session)
    const back = await getEntry(storage, 'a')
    expect(back!.llmSession).toEqual(session)
    expect(back!.sizeBytes).toBeGreaterThan(entry.sizeBytes)
  })

  it('setLlmSession clears the session when passed undefined', async () => {
    const entry = makeEntry('a', 'sha-a', 1000)
    await putEntry(storage, entry)
    await setLlmSession(storage, 'a', { messages: [{ role: 'user', content: 'hi', timestamp: 0 } as never], chatStartIndex: 1 })
    await setLlmSession(storage, 'a', undefined)
    const back = await getEntry(storage, 'a')
    expect(back!.llmSession).toBeUndefined()
    expect(back!.sizeBytes).toBe(computeEntrySizeBytes(entry.diff, entry.analyzedBy))
  })

  it('an entry rebuilt via putEntry without the field has no session', async () => {
    const entry = makeEntry('a', 'sha-a', 1000)
    await putEntry(storage, entry)
    await setLlmSession(storage, 'a', { messages: [{ role: 'user', content: 'hi', timestamp: 0 } as never], chatStartIndex: 1 })
    await putEntry(storage, makeEntry('a', 'sha-a', 2000))
    const back = await getEntry(storage, 'a')
    expect(back!.llmSession).toBeUndefined()
  })
})
