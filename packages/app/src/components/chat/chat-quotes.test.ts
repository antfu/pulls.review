import type { FileChange } from '@pulls.review/core/types'
import { describe, expect, it } from 'vitest'
import { buildChatQuote, withQuotes } from './chat-quotes'

const file: FileChange = {
  path: 'src/a.ts',
  status: 'modified',
  additions: 2,
  deletions: 1,
  isBinary: false,
  sha: 'sha',
  hunks: [
    {
      header: '@@ -3,3 +3,4 @@',
      oldStart: 3,
      oldLines: 3,
      newStart: 3,
      newLines: 4,
      patch: ' const a = 1\n-const b = 2\n+const b = 3\n+const c = 4\n const d = 5\n\\ No newline at end of file',
    },
    {
      header: '@@ -20,1 +21,1 @@',
      oldStart: 20,
      oldLines: 1,
      newStart: 21,
      newLines: 1,
      patch: ' const z = 0',
    },
  ],
}

describe('buildChatQuote', () => {
  it('quotes new-side lines without the removed lines between them', () => {
    expect(buildChatQuote(file, { start: 6, end: 3, side: 'additions' })).toEqual({
      label: 'src/a.ts:3-6',
      code: ' const a = 1\n+const b = 3\n+const c = 4\n const d = 5',
    })
  })

  it('quotes a single old-side line', () => {
    expect(buildChatQuote(file, { start: 4, end: 4, side: 'deletions' })).toEqual({
      label: 'src/a.ts:4 (old)',
      code: '-const b = 2',
    })
  })

  it('keeps both sides of a selection that spans them', () => {
    expect(buildChatQuote(file, { start: 5, side: 'additions', end: 4, endSide: 'deletions' })).toEqual({
      label: 'src/a.ts:old 4-new 5',
      code: '-const b = 2\n+const b = 3\n+const c = 4',
    })
  })

  it('keeps the hunk header when a selection crosses hunks', () => {
    expect(buildChatQuote(file, { start: 6, end: 21, side: 'additions' })?.code)
      .toBe(' const d = 5\n@@ -20,1 +21,1 @@\n const z = 0')
  })

  it('cuts expanded lines from the full file', () => {
    const contents = { new: 'one\ntwo\nconst a = 1' }
    expect(buildChatQuote(file, { start: 1, end: 3, side: 'additions' }, contents)).toEqual({
      label: 'src/a.ts:1-3',
      code: ' one\n two\n const a = 1',
    })
    expect(buildChatQuote(file, { start: 1, end: 3, side: 'additions' })).toBeUndefined()
  })
})

describe('withQuotes', () => {
  it('puts each quote in a diff block ahead of the question', () => {
    expect(withQuotes('Why?', [{ label: 'src/a.ts:4', code: '+const b = 3' }]))
      .toBe('`src/a.ts:4`\n```diff\n+const b = 3\n```\n\nWhy?')
  })

  it('outgrows the fences inside the quoted code', () => {
    expect(withQuotes('Why?', [{ label: 'a.md:1-3', code: '+```ts\n+x\n+```' }]))
      .toBe('`a.md:1-3`\n````diff\n+```ts\n+x\n+```\n````\n\nWhy?')
  })

  it('leaves a message without quotes as it is', () => {
    expect(withQuotes('Why?', [])).toBe('Why?')
  })
})
