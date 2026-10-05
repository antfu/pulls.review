import type { DiffHunk, FileChange, FileChangeStatus } from './types/diff'

const GIT_DIFF_HEADER_RE = /^diff --git a\/.* b\/(.*)$/
/** Git quotes a path holding a tab, newline, `"` or `\` (and, without `core.quotePath=false`, any non-ASCII byte). */
const QUOTED_GIT_DIFF_HEADER_RE = /^diff --git "a\/(?:[^"\\]|\\.)*" "b\/((?:[^"\\]|\\.)*)"$/
const C_ESCAPES: Record<string, number> = { 'a': 7, 'b': 8, 't': 9, 'n': 10, 'v': 11, 'f': 12, 'r': 13, '"': 34, '\\': 92 }

/** Reverses git's C-style quoting of a path (`"x\"y"` -> `x"y`); octal escapes are UTF-8 bytes. */
function unquoteGitPath(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"'))
    return text
  const bytes: number[] = []
  const body = text.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== '\\') {
      bytes.push(...new TextEncoder().encode(char))
      continue
    }
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1))
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8))
      i += 3
    }
    else {
      bytes.push(C_ESCAPES[body[i + 1]!] ?? body.charCodeAt(i + 1))
      i++
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}
const INDEX_LINE_RE = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?:\s+\d+)?$/
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/
const RENAME_FROM_RE = /^rename from (.+)$/
const RENAME_TO_RE = /^rename to (.+)$/
const COPY_FROM_RE = /^copy from (.+)$/
const COPY_TO_RE = /^copy to (.+)$/

interface ParsedChunk {
  path: string
  previousPath?: string
  status: FileChangeStatus
  isBinary: boolean
  oldIndexSha?: string
  newIndexSha?: string
  hunks: DiffHunk[]
}

function splitFileChunks(text: string): { chunks: string[], isGitDiff: boolean } {
  if (/^diff --git /m.test(text)) {
    const chunks = text.split(/(?=^diff --git )/m).filter(chunk => chunk.trim().length > 0)
    return { chunks, isGitDiff: true }
  }

  // Best-effort fallback for a plain POSIX `diff -u` with no git extended headers
  // and thus no rename detection.
  const chunks = text.split(/(?=^--- )/m).filter(chunk => chunk.trim().length > 0)
  return { chunks, isGitDiff: false }
}

/** Parses `@@ ... @@` hunk blocks out of a list of diff lines (with or without a leading `diff --git`/`---`/`+++` preamble). */
export function parseHunks(lines: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const match = HUNK_HEADER_RE.exec(line)
    if (!match) {
      i++
      continue
    }
    const header = line
    const oldStart = Number(match[1])
    const oldLines = match[2] === undefined ? 1 : Number(match[2])
    const newStart = Number(match[3])
    const newLines = match[4] === undefined ? 1 : Number(match[4])
    i++
    const bodyLines: string[] = []
    while (i < lines.length && !HUNK_HEADER_RE.test(lines[i]!)) {
      bodyLines.push(lines[i]!)
      i++
    }
    // Drop a single trailing empty string produced by a final newline split.
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '')
      bodyLines.pop()
    hunks.push({
      header,
      oldStart,
      oldLines,
      newStart,
      newLines,
      patch: bodyLines.join('\n'),
    })
  }
  return hunks
}

export function countChanges(hunks: DiffHunk[]): { additions: number, deletions: number } {
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const line of hunk.patch.split('\n')) {
      if (line.startsWith('+'))
        additions++
      else if (line.startsWith('-'))
        deletions++
    }
  }
  return { additions, deletions }
}

interface GitPreamble {
  isNewFile: boolean
  isDeletedFile: boolean
  isBinary: boolean
  renameFrom?: string
  renameTo?: string
  copyFrom?: string
  copyTo?: string
  oldIndexSha?: string
  newIndexSha?: string
  hunkStartIndex: number
}

function parseGitPreambleLine(line: string, preamble: GitPreamble): void {
  if (line === 'new file mode' || /^new file mode \d+$/.test(line)) {
    preamble.isNewFile = true
    return
  }
  if (/^deleted file mode \d+$/.test(line)) {
    preamble.isDeletedFile = true
    return
  }
  if (line.startsWith('Binary files ') && line.endsWith(' differ')) {
    preamble.isBinary = true
    return
  }
  if (line === 'GIT binary patch') {
    preamble.isBinary = true
    return
  }
  const unquoted = (match: RegExpExecArray | null) => match?.[1] === undefined ? undefined : unquoteGitPath(match[1])
  preamble.renameFrom ??= unquoted(RENAME_FROM_RE.exec(line))
  preamble.renameTo ??= unquoted(RENAME_TO_RE.exec(line))
  preamble.copyFrom ??= unquoted(COPY_FROM_RE.exec(line))
  preamble.copyTo ??= unquoted(COPY_TO_RE.exec(line))
  const indexMatch = INDEX_LINE_RE.exec(line)
  if (indexMatch) {
    preamble.oldIndexSha = indexMatch[1]
    preamble.newIndexSha = indexMatch[2]
  }
}

function parseGitPreamble(lines: string[]): GitPreamble {
  const preamble: GitPreamble = { isNewFile: false, isDeletedFile: false, isBinary: false, hunkStartIndex: -1 }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('@@ ')) {
      preamble.hunkStartIndex = i
      break
    }
    parseGitPreambleLine(line, preamble)
  }
  return preamble
}

function resolveGitStatusAndPath(preamble: GitPreamble, headerPath: string): { status: FileChangeStatus, path: string, previousPath?: string } {
  if (preamble.renameFrom && preamble.renameTo)
    return { status: 'renamed', previousPath: preamble.renameFrom, path: preamble.renameTo }
  if (preamble.copyFrom && preamble.copyTo)
    return { status: 'copied', previousPath: preamble.copyFrom, path: preamble.copyTo }
  if (preamble.isNewFile)
    return { status: 'added', path: headerPath }
  if (preamble.isDeletedFile)
    return { status: 'removed', path: headerPath }
  return { status: 'modified', path: headerPath }
}

function parseGitChunk(chunk: string): ParsedChunk {
  const lines = chunk.split('\n')
  const header = lines[0] ?? ''
  const quoted = QUOTED_GIT_DIFF_HEADER_RE.exec(header)?.[1]
  const headerPath = quoted === undefined ? GIT_DIFF_HEADER_RE.exec(header)?.[1] ?? '' : unquoteGitPath(`"${quoted}"`)
  const preamble = parseGitPreamble(lines)
  const { status, path, previousPath } = resolveGitStatusAndPath(preamble, headerPath)
  const hunks = preamble.isBinary || preamble.hunkStartIndex === -1 ? [] : parseHunks(lines.slice(preamble.hunkStartIndex))

  return {
    path,
    previousPath,
    status,
    isBinary: preamble.isBinary,
    oldIndexSha: preamble.oldIndexSha,
    newIndexSha: preamble.newIndexSha,
    hunks,
  }
}

function parsePosixChunk(chunk: string): ParsedChunk {
  const lines = chunk.split('\n')
  // `--- <path>\t...` / `+++ <path>\t...`; strip a trailing tab-separated timestamp.
  const oldPathLine = lines[0]?.replace(/^--- /, '').split('\t')[0] ?? ''
  const newPathLine = lines[1]?.replace(/^\+\+\+ /, '').split('\t')[0] ?? ''
  const path = newPathLine === '/dev/null' ? oldPathLine : newPathLine
  const status: FileChangeStatus = oldPathLine === '/dev/null' ? 'added' : newPathLine === '/dev/null' ? 'removed' : 'modified'
  const hunkStartIndex = lines.findIndex(line => line.startsWith('@@ '))
  const hunks = hunkStartIndex === -1 ? [] : parseHunks(lines.slice(hunkStartIndex))
  return { path, status, isBinary: false, hunks }
}

/** SHA-256 hex digest of arbitrary text: the same primitive `parsePatch` uses for its content-hash sha fallback, reused as the `paste` provider's cache key. */
export async function computeContentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Parses unified-diff / git-extended-diff text (the format shared by GitHub's
 * `.diff` endpoint, `git diff` output, and plain `diff -u`) into canonical
 * `FileChange`s.
 */
export async function parsePatch(text: string): Promise<FileChange[]> {
  const { chunks, isGitDiff } = splitFileChunks(text)

  return Promise.all(chunks.map(async (chunk) => {
    const parsed = isGitDiff ? parseGitChunk(chunk) : parsePosixChunk(chunk)
    const { additions, deletions } = countChanges(parsed.hunks)

    let sha: string
    if (parsed.status === 'removed' && parsed.oldIndexSha) {
      sha = parsed.oldIndexSha
    }
    else if (parsed.newIndexSha) {
      sha = parsed.newIndexSha
    }
    else {
      sha = await computeContentHash(chunk)
    }

    return {
      path: parsed.path,
      previousPath: parsed.previousPath,
      status: parsed.status,
      additions,
      deletions,
      isBinary: parsed.isBinary,
      sha,
      hunks: parsed.hunks,
    } satisfies FileChange
  }))
}
