import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCachedFileContent, setCachedFileContent } from './file-content-cache'
import { createCacheStorage } from './storage'

let storage: ReturnType<typeof createCacheStorage>

beforeEach(() => {
  storage = createCacheStorage(memoryDriver())
})

describe('file-content-cache', () => {
  it('round-trips content for a given path + sha', async () => {
    await setCachedFileContent(storage, 'src/foo.ts', 'sha-a', 'export const x = 1')
    await expect(getCachedFileContent(storage, 'src/foo.ts', 'sha-a')).resolves.toBe('export const x = 1')
  })

  it('misses on an unknown path/sha pair', async () => {
    await expect(getCachedFileContent(storage, 'src/foo.ts', 'sha-a')).resolves.toBeUndefined()
  })

  it('keys by both path and sha - same path at a different sha is a separate entry', async () => {
    await setCachedFileContent(storage, 'src/foo.ts', 'sha-a', 'old content')
    await setCachedFileContent(storage, 'src/foo.ts', 'sha-b', 'new content')

    await expect(getCachedFileContent(storage, 'src/foo.ts', 'sha-a')).resolves.toBe('old content')
    await expect(getCachedFileContent(storage, 'src/foo.ts', 'sha-b')).resolves.toBe('new content')
  })

  it('keys by both path and sha - the same sha at a different path is a separate entry', async () => {
    await setCachedFileContent(storage, 'src/foo.ts', 'sha-a', 'foo content')
    await setCachedFileContent(storage, 'src/bar.ts', 'sha-a', 'bar content')

    await expect(getCachedFileContent(storage, 'src/foo.ts', 'sha-a')).resolves.toBe('foo content')
    await expect(getCachedFileContent(storage, 'src/bar.ts', 'sha-a')).resolves.toBe('bar content')
  })
})
