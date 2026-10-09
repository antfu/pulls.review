import type { FileDiffMetadata } from '@pierre/diffs'
import type { FileChange } from '@pulls.review/core/types'
import { getSharedHighlighter, renderDiffWithHighlighter } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { buildFileDiff, needsFullFileToHighlight } from './file-diff-input'

// The only hunk starts on the backtick that *closes* a template literal opened
// above it, in lines the patch doesn't carry.
const contents = {
  old: 'const a = `\nx\n`\nfunction f() {\n  return 1\n}\n',
  new: 'const a = `\nx\n`\nfunction f() {\n  return 2\n}\n',
}

function fileChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'a.ts',
    status: 'modified',
    additions: 1,
    deletions: 1,
    isBinary: false,
    sha: 'sha',
    hunks: [{
      header: '@@ -3,4 +3,4 @@',
      oldStart: 3,
      oldLines: 4,
      newStart: 3,
      newLines: 4,
      patch: ' `\n function f() {\n-  return 1\n+  return 2\n }',
    }],
    ...overrides,
  }
}

const theme = 'pierre-dark'

/** Inline style of the first token on new-side line 4 (`function f() {`). */
async function functionLineStyle(diff: FileDiffMetadata) {
  const highlighter = await getSharedHighlighter({ themes: [theme], langs: ['typescript'] })
  const { code } = renderDiffWithHighlighter(diff, highlighter, {
    theme,
    lineDiffType: 'none',
    maxLineDiffLength: 1000,
    tokenizeMaxLineLength: 1000,
  } as any)
  const line: any = code.additionLines.find((node: any) => node?.properties?.['data-line'] === 4)
  return line?.children[0]?.properties.style
}

async function keywordStyle() {
  const highlighter = await getSharedHighlighter({ themes: [theme], langs: ['typescript'] })
  const [[token]] = highlighter.codeToTokens('function f() {}', { lang: 'typescript', theme }).tokens
  return `color:${token!.color}`
}

describe('buildFileDiff', () => {
  it('highlights a hunk that starts inside a multi-line construct when given the full file', async () => {
    expect(await functionLineStyle(buildFileDiff(fileChange(), contents)!)).toBe(await keywordStyle())
  })

  it('cannot highlight that hunk correctly from the patch alone', async () => {
    expect(await functionLineStyle(buildFileDiff(fileChange())!)).not.toBe(await keywordStyle())
  })
})

describe('needsFullFileToHighlight', () => {
  it('is true when a hunk starts past the first line', () => {
    expect(needsFullFileToHighlight(fileChange())).toBe(true)
  })

  it('is false when every hunk starts on the first line', () => {
    const [hunk] = fileChange().hunks
    expect(needsFullFileToHighlight(fileChange({ hunks: [{ ...hunk!, oldStart: 1, newStart: 1 }] }))).toBe(false)
  })

  it('is false when the patch already is the whole file', () => {
    expect(needsFullFileToHighlight(fileChange({ status: 'added' }))).toBe(false)
    expect(needsFullFileToHighlight(fileChange({ status: 'removed' }))).toBe(false)
  })

  it('is false for binary and truncated files', () => {
    expect(needsFullFileToHighlight(fileChange({ isBinary: true }))).toBe(false)
    expect(needsFullFileToHighlight(fileChange({ truncated: true, hunks: [] }))).toBe(false)
  })
})
