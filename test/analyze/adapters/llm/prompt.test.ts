import type { FileChange } from '../../../../app/types/diff'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { buildAnalysisPrompt, buildManifest } from '../../../../app/analyze/adapters/llm/prompt'

function file(overrides: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: 'modified',
    additions: 1,
    deletions: 0,
    isBinary: false,
    sha: overrides.path,
    hunks: [],
    ...overrides,
  }
}

const fixturesDir = join(process.cwd(), 'test/fixtures/real')
const fixtureNames = readdirSync(fixturesDir).filter(name => name.endsWith('.json')).sort()

describe('buildAnalysisPrompt snapshot', () => {
  it.each(fixtureNames)('matches the snapshot for fixtures/real/%s', async (name) => {
    const { diff } = JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))
    const prompt = buildAnalysisPrompt(diff)
    await expect(prompt).toMatchFileSnapshot(
      `./__snapshots__/${name}.agent-prompt.snap.md`,
    )
  })
})

describe('buildManifest', () => {
  it('groups files under their directory heading, indented', () => {
    const manifest = buildManifest([
      file({ path: 'app/auth/login.ts' }),
      file({ path: 'app/auth/logout.ts' }),
    ])
    expect(manifest).toBe([
      'app/auth/',
      '  login.ts  M  +1/-0',
      '  logout.ts  M  +1/-0',
    ].join('\n'))
  })

  it('lists root-level files with no heading and no indent', () => {
    const manifest = buildManifest([file({ path: 'README.md' })])
    expect(manifest).toBe('README.md  M  +1/-0')
  })

  it('appends the previous path for renames', () => {
    const manifest = buildManifest([
      file({ path: 'app/new.ts', status: 'renamed', previousPath: 'app/old.ts' }),
    ])
    expect(manifest).toBe('app/\n  new.ts (from app/old.ts)  R  +1/-0')
  })

  it('tags generated paths instead of showing hunk context', () => {
    const manifest = buildManifest([file({ path: 'pnpm-lock.yaml' })])
    expect(manifest).toBe('pnpm-lock.yaml  M  +1/-0  [generated]')
  })

  it('tags binary files instead of showing hunk context', () => {
    const manifest = buildManifest([file({ path: 'app/logo.png', isBinary: true })])
    expect(manifest).toBe('app/\n  logo.png  M  +1/-0  [binary]')
  })

  it('dedupes and caps hunk contexts at 3, trimmed from after the second @@', () => {
    const hunks = ['a', 'a', 'b', 'c', 'd'].map(context => ({
      header: `@@ -1,1 +1,1 @@ ${context}`,
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      patch: 'x',
    }))
    const manifest = buildManifest([file({ path: 'app/x.ts', hunks })])
    expect(manifest).toBe('app/\n  x.ts  M  +1/-0  @@ a / @@ b / @@ c')
  })

  it('omits the tag field when there is no hunk context', () => {
    const manifest = buildManifest([
      file({ path: 'app/x.ts', hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch: 'x' }] }),
    ])
    expect(manifest).toBe('app/\n  x.ts  M  +1/-0')
  })
})
