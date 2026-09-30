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
    const prompt = buildAnalysisPrompt(diff, 'en')
    await expect(prompt).toMatchFileSnapshot(
      `./__snapshots__/${name}.agent-prompt.snap.md`,
    )
  })
})

describe('buildAnalysisPrompt commits', () => {
  const base = { provider: 'github', id: 'github:o/r#1', title: 'T', files: [file({ path: 'a.ts' })] } as const

  it('lists short sha and subject line of each commit, oldest first', () => {
    const prompt = buildAnalysisPrompt({
      ...base,
      commits: [
        { sha: 'aaaaaaa111', message: 'feat: add parser\n\nlong body' },
        { sha: 'bbbbbbb222', message: 'test: cover parser' },
      ],
    }, 'en')
    expect(prompt).toContain('---COMMITS--- (2, oldest first)\naaaaaaa feat: add parser\nbbbbbbb test: cover parser\n\n---MANIFEST---')
  })

  it('omits the section for a single commit', () => {
    const prompt = buildAnalysisPrompt({ ...base, commits: [{ sha: 'aaaaaaa111', message: 'feat: x' }] }, 'en')
    expect(prompt).not.toContain('---COMMITS---')
  })
})

describe('buildAnalysisPrompt language', () => {
  const base = { provider: 'github', id: 'github:o/r#1', title: 'T', files: [file({ path: 'a.ts' })] } as const

  it('stays English and closes with the language to answer in', () => {
    expect(buildAnalysisPrompt(base, 'en')).toMatch(/\n\nRespond and categorize in English\.$/)
    expect(buildAnalysisPrompt(base, 'zh-CN')).toMatch(/\n\nRespond and categorize in Simplified Chinese \(简体中文\)\.$/)
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
