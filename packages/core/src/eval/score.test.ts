import type { GroupedResult } from '../types/analyze'
import { describe, expect, it } from 'vitest'
import { scoreGrouping } from './score'

function result(groups: { key: string, filePaths: string[], critical?: boolean }[]): GroupedResult {
  return {
    source: 'llm',
    generatedAt: '2026-10-28T12:00:00.000Z',
    schemaVersion: 1,
    groups: groups.map(group => ({ label: group.key, ...group })),
  }
}

describe('scoreGrouping', () => {
  it('scores a perfect grouping at 1', () => {
    const expected = result([{ key: 'a', filePaths: ['a.ts', 'b.ts'] }, { key: 'c', filePaths: ['c.ts'] }])
    expect(scoreGrouping(expected, expected)).toMatchObject({ pairwisePrecision: 1, pairwiseRecall: 1, pairwiseF1: 1 })
  })

  it('penalizes splitting and merging groups', () => {
    const expected = result([{ key: 'a', filePaths: ['a.ts', 'b.ts'] }, { key: 'c', filePaths: ['c.ts', 'd.ts'] }])
    const actual = result([{ key: 'x', filePaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }])
    const score = scoreGrouping(expected, actual)
    expect(score.pairwiseRecall).toBe(1)
    expect(score.pairwisePrecision).toBeCloseTo(2 / 6)
    expect(score.pairwiseF1).toBeLessThan(1)
  })

  it('measures critical-group recall by covered files', () => {
    const expected = result([{ key: 'auth', filePaths: ['a.ts', 'b.ts'], critical: true }, { key: 'docs', filePaths: ['c.md'] }])
    const actual = result([{ key: 'auth', filePaths: ['a.ts'], critical: true }, { key: 'misc', filePaths: ['b.ts', 'c.md'] }])
    expect(scoreGrouping(expected, actual).criticalFileRecall).toBe(0.5)
  })
})
