import type { FileChange } from '@pulls.review/core/types'
import { describe, expect, it } from 'vitest'
import { fileRows } from './file-rows'

function file(path: string): FileChange {
  return { path, status: 'modified', additions: 1, deletions: 1, isBinary: false, sha: path, hunks: [] }
}

function outline(rows: ReturnType<typeof fileRows>) {
  return rows.map(row => `${'  '.repeat(row.depth)}${row.type === 'folder' ? `${row.name}/` : row.name}`)
}

describe('fileRows', () => {
  it('keeps the diff order in the tree, placing each folder where its first file appears', () => {
    const files = ['z.ts', 'src/b.ts', 'docs/x.md', 'src/a.ts'].map(file)

    expect(outline(fileRows(files, ['old.ts'], 'tree'))).toEqual([
      'z.ts',
      'src/',
      '  b.ts',
      '  a.ts',
      'docs/',
      '  x.md',
      'old.ts',
    ])
  })

  it('collapses single-child folder chains', () => {
    expect(outline(fileRows(['a/b/c.ts', 'a/b/d.ts'].map(file), [], 'tree'))).toEqual([
      'a/b/',
      '  c.ts',
      '  d.ts',
    ])
  })

  it('lists full paths flat in the exact diff order', () => {
    const rows = fileRows(['z.ts', 'src/b.ts', 'docs/x.md', 'src/a.ts'].map(file), ['old.ts'], 'list')

    expect(outline(rows)).toEqual(['z.ts', 'src/b.ts', 'docs/x.md', 'src/a.ts', 'old.ts'])
    expect(rows.at(-1)!.type).toBe('missing')
  })
})
