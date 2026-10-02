import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFileContentCache } from './file-content-cache'

let cache: ReturnType<typeof createFileContentCache>

beforeEach(() => {
  cache = createFileContentCache(createStorage({ driver: memoryDriver() }))
})

describe('file content cache', () => {
  it('round-trips content for a given path + sha', async () => {
    await cache.set('src/foo.ts', 'sha-a', 'export const x = 1')
    await expect(cache.get('src/foo.ts', 'sha-a')).resolves.toBe('export const x = 1')
  })

  it('misses on an unknown path/sha pair', async () => {
    await expect(cache.get('src/foo.ts', 'sha-a')).resolves.toBeUndefined()
  })

  it('keys by both path and sha', async () => {
    await cache.set('src/foo.ts', 'sha-a', 'old content')
    await cache.set('src/foo.ts', 'sha-b', 'new content')
    await cache.set('src/bar.ts', 'sha-a', 'bar content')

    await expect(cache.get('src/foo.ts', 'sha-a')).resolves.toBe('old content')
    await expect(cache.get('src/foo.ts', 'sha-b')).resolves.toBe('new content')
    await expect(cache.get('src/bar.ts', 'sha-a')).resolves.toBe('bar content')
  })
})
