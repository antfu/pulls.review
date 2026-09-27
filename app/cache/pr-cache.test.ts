import type { LlmSession, PrCacheEntry } from '../types/cache'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { computeEntrySizeBytes, enforceBudget, getEntry, listRecentEntries, putEntry, setLlmSession, touchEntry } from './pr-cache'
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
    await setReviewed(storage, 'sha-old', true)
    await setReviewed(storage, 'sha-new', true)
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
