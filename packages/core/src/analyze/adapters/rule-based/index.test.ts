import type { DiffsPayload } from '../../../types/diff'
import { describe, expect, it } from 'vitest'
import { createRuleBasedAdapter } from './index'

const ruleBasedAdapter = createRuleBasedAdapter(key => ({ label: key[0]!.toUpperCase() + key.slice(1), summary: `Files matched by the ${key} rule.` }))

function file(path: string, isBinary = false): DiffsPayload['files'][number] {
  return { path, status: 'modified', additions: 1, deletions: 0, isBinary, sha: path, hunks: [] }
}

describe('ruleBasedAdapter', () => {
  it('groups files across multiple categories, flat (no nesting)', async () => {
    const diff: DiffsPayload = {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 't',
      description: '',
      files: [file('src/index.ts'), file('src/index.test.ts'), file('README.md'), file('package.json')],
    }
    const result = await ruleBasedAdapter.analyze(diff)

    expect(result.source).toBe('rule-based')
    expect(result.overallSummary).toBeUndefined()
    for (const group of result.groups)
      expect(group.children).toBeUndefined()

    const byCategory = Object.fromEntries(result.groups.map(g => [g.key, g.filePaths]))
    expect(byCategory.code).toEqual(['src/index.ts'])
    expect(byCategory.tests).toEqual(['src/index.test.ts'])
    expect(byCategory.docs).toEqual(['README.md'])
    expect(byCategory.deps).toEqual(['package.json'])
  })

  it('falls back to the code group for anything unmatched', async () => {
    const diff: DiffsPayload = {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 't',
      description: '',
      files: [file('src/weird-file.xyz')],
    }
    const result = await ruleBasedAdapter.analyze(diff)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.key).toBe('code')
  })

  it('puts binary files (images, fonts, ...) under "other", regardless of path', async () => {
    const diff: DiffsPayload = {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 't',
      description: '',
      files: [file('docs/logo.png', true), file('src/index.ts')],
    }
    const result = await ruleBasedAdapter.analyze(diff)
    const byCategory = Object.fromEntries(result.groups.map(g => [g.key, g.filePaths]))
    expect(byCategory.other).toEqual(['docs/logo.png'])
    expect(byCategory.code).toEqual(['src/index.ts'])
  })

  it('is always available and needs no network', () => {
    expect(ruleBasedAdapter.available).toBe(true)
  })

  it('labels every group with the supplied text, even without an LLM', async () => {
    const diff: DiffsPayload = {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 't',
      description: '',
      files: [file('src/index.ts')],
    }
    const result = await ruleBasedAdapter.analyze(diff)
    expect(result.groups[0]?.label).toBe('Code')
    expect(result.groups[0]?.summary).toBeTruthy()
  })

  it('tags every group with a category, mapping code to core and generated to other', async () => {
    const diff: DiffsPayload = {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 't',
      description: '',
      files: [file('src/index.ts'), file('pnpm-lock.yaml'), file('README.md')],
    }
    const result = await ruleBasedAdapter.analyze(diff)
    const categories = Object.fromEntries(result.groups.map(g => [g.key, g.category]))
    expect(categories).toEqual({ code: 'core', generated: 'other', docs: 'docs' })
  })
})
