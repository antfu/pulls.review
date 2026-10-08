import type { DiffSide, ReviewDraftTarget } from '../../types/comment-threads'
import type { FileChange } from '../../types/diff'
import { diagnostics } from '../../diagnostics'

/**
 * Translation between the canonical place of a comment (a path, a side and that
 * side's line number) and a GitLab diff position, which names a line by the
 * numbers it has on both sides and pins it to one version of the diff.
 */

/** The diff a position is placed on: the three commits GitLab identifies a diff version by, and its files. */
export interface DiffVersion {
  baseSha: string
  startSha: string
  headSha: string
  files: FileChange[]
}

interface LinePositionJson {
  line_code: string
  /** `new` for a line the diff adds, `old` for every other line. */
  type: 'new' | 'old'
  old_line?: number | null
  new_line?: number | null
}

export interface GitlabPositionJson {
  position_type: string
  base_sha: string
  start_sha: string
  head_sha: string
  old_path: string
  new_path: string
  /** Set alone on a removed line, together with `new_line` on an unchanged one. */
  old_line?: number | null
  /** Set alone on an added line, together with `old_line` on an unchanged one. */
  new_line?: number | null
  line_range?: { start: LinePositionJson, end: LinePositionJson } | null
}

interface DiffLine {
  type: 'added' | 'removed' | 'context'
  /** Both counters as they stand at this line, whichever side it is on: GitLab's line code needs the pair. */
  old: number
  new: number
}

function* diffLines(file: FileChange): Generator<DiffLine> {
  for (const hunk of file.hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const line of hunk.patch.split('\n')) {
      // `\ No newline at end of file` annotates the line before it.
      if (line.startsWith('\\'))
        continue
      if (line.startsWith('+')) {
        yield { type: 'added', old: oldLine, new: newLine++ }
      }
      else if (line.startsWith('-')) {
        yield { type: 'removed', old: oldLine++, new: newLine }
      }
      else {
        yield { type: 'context', old: oldLine++, new: newLine++ }
      }
    }
  }
}

function locate(file: FileChange, side: DiffSide, line: number): DiffLine {
  for (const candidate of diffLines(file)) {
    const onSide = side === 'additions'
      ? candidate.type !== 'removed' && candidate.new === line
      : candidate.type !== 'added' && candidate.old === line
    if (onSide)
      return candidate
  }
  throw diagnostics.lineNotInDiff({ path: file.path, line })
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function lineNumbers(line: DiffLine): { old_line?: number, new_line?: number } {
  return {
    old_line: line.type === 'added' ? undefined : line.old,
    new_line: line.type === 'removed' ? undefined : line.new,
  }
}

function rangeEnd(line: DiffLine, pathHash: string): LinePositionJson {
  return {
    line_code: `${pathHash}_${line.old}_${line.new}`,
    type: line.type === 'added' ? 'new' : 'old',
    ...lineNumbers(line),
  }
}

/** Throws `lineNotInDiff` when the target is not a line `version` shows. */
export async function toGitlabPosition(version: DiffVersion, target: ReviewDraftTarget): Promise<GitlabPositionJson> {
  const file = version.files.find(candidate => candidate.path === target.path)
  if (!file)
    throw diagnostics.lineNotInDiff({ path: target.path, line: target.line })
  const end = locate(file, target.side, target.line)
  const position: GitlabPositionJson = {
    position_type: 'text',
    base_sha: version.baseSha,
    start_sha: version.startSha,
    head_sha: version.headSha,
    old_path: file.previousPath ?? file.path,
    new_path: file.path,
    ...lineNumbers(end),
  }
  if (target.startLine !== undefined && target.startLine !== target.line) {
    const pathHash = await sha1Hex(file.path)
    const start = locate(file, target.startSide ?? target.side, target.startLine)
    position.line_range = { start: rangeEnd(start, pathHash), end: rangeEnd(end, pathHash) }
  }
  return position
}

function sideOf(line: { new_line?: number | null }): DiffSide {
  return line.new_line == null ? 'deletions' : 'additions'
}

/** Where a thread sits in the diff whose head is `headSha`; without a `line` it is outdated or not on a line at all. */
export interface ThreadAnchor {
  path: string
  side: DiffSide
  line?: number
  startLine?: number
  startSide?: DiffSide
  outdated: boolean
}

/**
 * GitLab moves a position along with new commits while its line survives them, so
 * one still pinned to an older head is outdated. A comment on a whole file or an
 * image has no line and is treated the same way.
 */
export function fromGitlabPosition(position: GitlabPositionJson, headSha: string): ThreadAnchor {
  const side = sideOf(position)
  const line = position.new_line ?? position.old_line ?? undefined
  const anchor = { path: position.new_path, side }
  if (position.head_sha !== headSha || line === undefined)
    return { ...anchor, outdated: true }
  const start = position.line_range?.start
  const startLine = start ? start.new_line ?? start.old_line ?? undefined : undefined
  return startLine === undefined || startLine === line
    ? { ...anchor, line, outdated: false }
    : { ...anchor, line, startLine, startSide: sideOf(start!), outdated: false }
}
