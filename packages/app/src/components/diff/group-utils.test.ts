import type { FileChange } from '@pulls.review/core/types'
import { describe, expect, it } from 'vitest'
import { countGroupFiles, countGroupStats, fileIsCritical, groupIsCritical, resolveGroups } from './group-utils'

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

describe('resolveGroups notes', () => {
  const hunk = { header: '@@ -10,3 +20,5 @@', oldStart: 10, oldLines: 3, newStart: 20, newLines: 5, patch: '' }
  const changed: FileChange = { ...file('x.ts'), hunks: [hunk] }

  it('attaches notes to their file and anchors a line a hunk shows, defaulting to the additions side', () => {
    const [group] = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'], notes: [
        { path: 'x.ts', text: 'whole file' },
        { path: 'x.ts', line: 22, text: 'new line' },
        { path: 'x.ts', line: 11, side: 'deletions', text: 'old line', critical: true },
      ] }],
      [changed],
    )

    expect(group!.notes.get('x.ts')).toEqual([
      { text: 'whole file', critical: false },
      { text: 'new line', critical: false, anchor: { side: 'additions', line: 22 } },
      { text: 'old line', critical: true, anchor: { side: 'deletions', line: 11 } },
    ])
    expect(fileIsCritical(group!.notes.get('x.ts'))).toBe(true)
  })

  it('renders a note whose line no hunk shows as a file-level note instead of losing it', () => {
    const [group] = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'], notes: [{ path: 'x.ts', line: 99, text: 'off-screen' }] }],
      [changed],
    )

    expect(group!.notes.get('x.ts')).toEqual([{ text: 'off-screen', critical: false }])
  })

  it('anchors to the deletions side by default on a deleted file', () => {
    const deleted: FileChange = { ...file('x.ts'), status: 'removed', hunks: [{ ...hunk, newStart: 0, newLines: 0 }] }
    const [group] = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['x.ts'], notes: [{ path: 'x.ts', line: 11, text: 'gone' }] }],
      [deleted],
    )

    expect(group!.notes.get('x.ts')![0]!.anchor).toEqual({ side: 'deletions', line: 11 })
  })

  it('drops notes on paths that left the diff and finds a renamed file by its old path', () => {
    const [group] = resolveGroups(
      [{ key: 'a', label: 'A', filePaths: ['old.ts', 'gone.ts'], notes: [
        { path: 'old.ts', text: 'renamed' },
        { path: 'gone.ts', text: 'vanished' },
      ] }],
      [file('new.ts', 'old.ts')],
    )

    expect([...group!.notes.keys()]).toEqual(['new.ts'])
  })

  it('derives criticality from the group flag, a critical note, or a critical child', () => {
    const groups = resolveGroups([
      { key: 'flagged', label: 'F', critical: true, filePaths: ['x.ts'] },
      { key: 'noted', label: 'N', filePaths: ['y.ts'], notes: [{ path: 'y.ts', text: 'careful', critical: true }] },
      { key: 'parent', label: 'P', filePaths: [], children: [{ key: 'child', label: 'C', critical: true, filePaths: ['z.ts'] }] },
      { key: 'plain', label: 'Q', filePaths: ['w.ts'], notes: [{ path: 'w.ts', text: 'fyi' }] },
    ], [file('x.ts'), file('y.ts'), file('z.ts'), file('w.ts')])

    expect(groups.map(group => group.critical)).toEqual([true, true, false, false])
    expect(groups.map(groupIsCritical)).toEqual([true, true, true, false])
  })
})
