import type { GroupedResult } from '../types/analyze'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { analysisIdentity, createAnalysisCache } from './analysis-cache'

function result(generatedAt = '2026-01-01T00:00:00.000Z'): GroupedResult {
  return { source: 'llm', schemaVersion: 1, generatedAt, groups: [] }
}

describe('analysisIdentity', () => {
  it('names a diff by its commits', () => {
    expect(analysisIdentity({ base: { sha: 'a', ref: 'main' }, head: { sha: 'b', ref: 'feat' } })).toBe('a...b')
  })

  it('is undefined without both commits, so a paste never inherits another diff\'s analysis', () => {
    expect(analysisIdentity({ head: { sha: 'b', ref: 'feat' } })).toBeUndefined()
    expect(analysisIdentity({ base: { sha: 'a', ref: 'main' } })).toBeUndefined()
    expect(analysisIdentity({})).toBeUndefined()
  })
})

describe('createAnalysisCache', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage({ driver: memoryDriver() })
  })

  it('returns a result stored under the same identity, and nothing under another', async () => {
    const cache = createAnalysisCache(storage)
    const stored = result()

    await cache.set('a...b', stored)

    expect(await cache.get('a...b')).toEqual(stored)
    expect(await cache.get('a...c')).toBeUndefined()
  })

  it('reads a corrupt or unknown-shape entry as a miss rather than throwing', async () => {
    const cache = createAnalysisCache(storage)

    await storage.setItem('analysis:a...b', 'not a record')
    expect(await cache.get('a...b')).toBeUndefined()

    await storage.setItem('analysis:a...b', { savedAt: 1, result: { source: 'llm' } })
    expect(await cache.get('a...b')).toBeUndefined()
  })

  it('evicts the oldest entries once over the limit, keeping the newest', async () => {
    const cache = createAnalysisCache(storage, 2)

    await cache.set('a...1', result('2026-01-01T00:00:00.000Z'))
    await cache.set('a...2', result('2026-01-02T00:00:00.000Z'))
    await cache.set('a...3', result('2026-01-03T00:00:00.000Z'))

    expect(await cache.get('a...1')).toBeUndefined()
    expect(await cache.get('a...2')).toBeDefined()
    expect(await cache.get('a...3')).toBeDefined()
  })
})
