import type { FileChange } from '../../types/diff'
import type { DiffVersion, GitlabPositionJson } from './position'
import { describe, expect, it } from 'vitest'
import { parseHunks } from '../../patch-parser'
import { fromGitlabPosition, toGitlabPosition } from './position'

// old 10..13 -> new 10..14:  10 ctx | 11 removed | (new 11, 12 added) | 12->13 ctx | 13->14 ctx
const PATCH = [
  '@@ -10,4 +10,5 @@',
  ' keep',
  '-drop',
  '+add one',
  '+add two',
  ' still',
  ' last',
  '\\ No newline at end of file',
]

function file(path: string, previousPath?: string): FileChange {
  return { path, previousPath, status: previousPath ? 'renamed' : 'modified', additions: 2, deletions: 1, isBinary: false, sha: 'blob', hunks: parseHunks(PATCH) }
}

const version: DiffVersion = { baseSha: 'base', startSha: 'start', headSha: 'head', files: [file('src/a.ts'), file('new/b.ts', 'old/b.ts')] }
const shas = { position_type: 'text', base_sha: 'base', start_sha: 'start', head_sha: 'head' }

describe('toGitlabPosition', () => {
  it('names an added line by its new number only', async () => {
    expect(await toGitlabPosition(version, { path: 'src/a.ts', side: 'additions', line: 12 }))
      .toEqual({ ...shas, old_path: 'src/a.ts', new_path: 'src/a.ts', old_line: undefined, new_line: 12 })
  })

  it('names a removed line by its old number only', async () => {
    expect(await toGitlabPosition(version, { path: 'src/a.ts', side: 'deletions', line: 11 }))
      .toEqual({ ...shas, old_path: 'src/a.ts', new_path: 'src/a.ts', old_line: 11, new_line: undefined })
  })

  it('names an unchanged line by both numbers, from whichever side it was picked on', async () => {
    const both = { ...shas, old_path: 'src/a.ts', new_path: 'src/a.ts', old_line: 12, new_line: 13 }
    expect(await toGitlabPosition(version, { path: 'src/a.ts', side: 'additions', line: 13 })).toEqual(both)
    expect(await toGitlabPosition(version, { path: 'src/a.ts', side: 'deletions', line: 12 })).toEqual(both)
  })

  it('gives a renamed file both of its paths', async () => {
    expect(await toGitlabPosition(version, { path: 'new/b.ts', side: 'additions', line: 11 }))
      .toMatchObject({ old_path: 'old/b.ts', new_path: 'new/b.ts', new_line: 11 })
  })

  it('describes a multi-line range by the line code of each end', async () => {
    const position = await toGitlabPosition(version, { path: 'src/a.ts', side: 'additions', line: 12, startSide: 'deletions', startLine: 11 })

    // A line code is the SHA-1 of the path, then the old and new counters at that line.
    const pathHash = '21ff24dd18cc19d35de15a120639695824655b58'
    expect(position).toMatchObject({ old_line: undefined, new_line: 12 })
    expect(position.line_range).toEqual({
      start: { line_code: `${pathHash}_11_11`, type: 'old', old_line: 11, new_line: undefined },
      end: { line_code: `${pathHash}_12_12`, type: 'new', old_line: undefined, new_line: 12 },
    })
  })

  it('refuses a line the diff does not show, or a file it does not hold', async () => {
    await expect(toGitlabPosition(version, { path: 'src/a.ts', side: 'additions', line: 99 })).rejects.toMatchObject({ name: 'lineNotInDiff' })
    // New line 11 was added: it has no old-side counterpart to comment on.
    await expect(toGitlabPosition(version, { path: 'src/a.ts', side: 'deletions', line: 14 })).rejects.toMatchObject({ name: 'lineNotInDiff' })
    await expect(toGitlabPosition(version, { path: 'nope.ts', side: 'additions', line: 1 })).rejects.toMatchObject({ name: 'lineNotInDiff' })
  })
})

describe('fromGitlabPosition', () => {
  const position: GitlabPositionJson = { ...shas, old_path: 'old/b.ts', new_path: 'new/b.ts' }

  it('anchors added and unchanged lines on the new side, removed lines on the old', () => {
    expect(fromGitlabPosition({ ...position, new_line: 12 }, 'head')).toEqual({ path: 'new/b.ts', side: 'additions', line: 12, outdated: false })
    expect(fromGitlabPosition({ ...position, old_line: 12, new_line: 13 }, 'head')).toEqual({ path: 'new/b.ts', side: 'additions', line: 13, outdated: false })
    expect(fromGitlabPosition({ ...position, old_line: 11, new_line: null }, 'head')).toEqual({ path: 'new/b.ts', side: 'deletions', line: 11, outdated: false })
  })

  it('reads the start of a multi-line range', () => {
    const line_range = {
      start: { line_code: 'x_11_11', type: 'old' as const, old_line: 11, new_line: null },
      end: { line_code: 'x_12_12', type: 'new' as const, old_line: null, new_line: 12 },
    }
    expect(fromGitlabPosition({ ...position, new_line: 12, line_range }, 'head'))
      .toEqual({ path: 'new/b.ts', side: 'additions', line: 12, startLine: 11, startSide: 'deletions', outdated: false })
  })

  it('treats a position pinned to an older head, or one with no line, as outdated', () => {
    expect(fromGitlabPosition({ ...position, new_line: 12 }, 'newer-head')).toEqual({ path: 'new/b.ts', side: 'additions', outdated: true })
    expect(fromGitlabPosition({ ...position, position_type: 'file' }, 'head')).toEqual({ path: 'new/b.ts', side: 'deletions', outdated: true })
  })

  it('reads back what toGitlabPosition wrote', async () => {
    const target = { path: 'src/a.ts', side: 'deletions', line: 11 } as const
    expect(fromGitlabPosition(await toGitlabPosition(version, target), 'head')).toEqual({ ...target, outdated: false })
  })
})
