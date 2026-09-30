import type { FileChange } from '../../types/diff'
import { describe, expect, it } from 'vitest'
import { countGroupFiles, countGroupStats, resolveGroups } from './group-utils'

function file(path: string, previousPath?: string): FileChange {
  return { path, previousPath, status: previousPath ? 'renamed' : 'modified', additions: 2, deletions: 1, isBinary: false, sha: path, hunks: [] }
}

describe('resolveGroups', () => {
  it('resolves paths into files and totals their counts, without an Uncategorized group when everything is covered', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'], children: [{ key: 'a-1', label: 'A1', filePaths: ['y.ts'] }] }],
      [file('x.ts'), file('y.ts')],
    )

    expect(groups.map(group => group.key)).toEqual(['a'])
    expect(groups[0]!.files.map(f => f.path)).toEqual(['x.ts'])
    expect(groups[0]!.children[0]!.files.map(f => f.path)).toEqual(['y.ts'])
    expect(groups[0]!.missing).toEqual([])
    expect(countGroupFiles(groups[0]!)).toBe(2)
    expect(countGroupStats(groups[0]!)).toEqual({ added: 4, deleted: 2 })
  })

  it('falls back to the "other" category for groups stored before the field existed, and for Uncategorized', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'], children: [{ key: 'a-1', label: 'A1', category: 'tests', filePaths: ['y.ts'] }] }],
      [file('x.ts'), file('y.ts'), file('new.ts')],
    )

    expect(groups.map(group => group.category)).toEqual(['other', 'other'])
    expect(groups[0]!.children[0]!.category).toBe('tests')
  })

  it('collects files no group names into a trailing Uncategorized group', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'] }],
      [file('x.ts'), file('new.ts')],
    )

    expect(groups.map(group => group.key)).toEqual(['a', 'uncategorized'])
    expect(groups[1]!.label).toBe('Uncategorized')
    expect(groups[1]!.files.map(f => f.path)).toEqual(['new.ts'])
  })

  it('keeps paths that left the diff as missing, and still renders a group whose files are all gone', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['gone.ts'], children: [{ key: 'a-1', label: 'A1', filePaths: ['also-gone.ts'] }] }],
      [file('x.ts')],
    )

    expect(groups[0]!.files).toEqual([])
    expect(groups[0]!.missing).toEqual(['gone.ts'])
    expect(groups[0]!.children[0]!.missing).toEqual(['also-gone.ts'])
    expect(countGroupFiles(groups[0]!)).toBe(0)
    expect(groups[1]!.key).toBe('uncategorized')
  })

  it('finds a renamed file by the path the analysis knew it under', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['old.ts'] }],
      [file('new.ts', 'old.ts')],
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]!.files.map(f => f.path)).toEqual(['new.ts'])
    expect(groups[0]!.missing).toEqual([])
  })

  it('lets two groups share a file rather than picking one', () => {
    const groups = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'] }, { key: 'b', label: 'B', filePaths: ['x.ts'] }],
      [file('x.ts')],
    )

    expect(groups.map(group => group.files.length)).toEqual([1, 1])
  })
})
