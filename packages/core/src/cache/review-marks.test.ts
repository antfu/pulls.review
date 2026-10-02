import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { beforeEach, describe, expect, it } from 'vitest'
import { createReviewMarks } from './review-marks'

let marks: ReturnType<typeof createReviewMarks>

beforeEach(() => {
  marks = createReviewMarks(createStorage({ driver: memoryDriver() }))
})

describe('review marks', () => {
  it('marks and reads back reviewed shas', async () => {
    await marks.set(['sha-a', 'sha-c'], true)
    expect(await marks.get(['sha-a', 'sha-b', 'sha-c'])).toEqual(new Set(['sha-a', 'sha-c']))
  })

  it('unmarks a reviewed sha', async () => {
    await marks.set(['sha-a'], true)
    await marks.set(['sha-a'], false)
    expect((await marks.get(['sha-a'])).size).toBe(0)
  })

  it('prunes review marks whose sha is no longer referenced by any cached diff', async () => {
    await marks.set(['sha-a', 'sha-b'], true)
    await marks.prune(new Set(['sha-a']))
    expect(await marks.get(['sha-a', 'sha-b'])).toEqual(new Set(['sha-a']))
  })
})
