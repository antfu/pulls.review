import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ruleBasedAdapter } from '../../../../src/analyze'

const fixturesDir = join(import.meta.dirname, '../../../fixtures/real')
const fixtureNames = readdirSync(fixturesDir).filter(name => name.endsWith('.json')).sort()

describe('ruleBasedAdapter output snapshot', () => {
  it.each(fixtureNames)('matches the snapshot for fixtures/real/%s', async (name) => {
    const { diff } = JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))
    const result = await ruleBasedAdapter.analyze(diff)
    // `generatedAt` is a timestamp - fixed to a constant so the snapshot is deterministic.
    await expect(
      JSON.stringify({ ...result, generatedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
    )
      .toMatchFileSnapshot(
        `./__snapshots__/${name}.snap.json`,
      )
  })
})
