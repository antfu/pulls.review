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

interface HunkSection {
  hunks: DiffHunk[]
  /** A reader that extended hunks up to the next header saw different text. */
  boundedDifferently: boolean
}

interface ParsedChunk extends HunkSection {
  path: string
  previousPath?: string
  status: FileChangeStatus
  isBinary: boolean
  oldIndexSha?: string
  newIndexSha?: string
}

/** The declared old/new ranges delimit the body even when its text resembles a file header. */
function hunkEnd(lines: string[], start: number, header: RegExpExecArray): number {
  let oldLeft = Number(header[2] ?? 1)
  let newLeft = Number(header[4] ?? 1)
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]!
    // A missing-newline annotation belongs to the preceding line on either side.
    if (line.startsWith('\\ '))
      continue
    // Git can suppress the space prefix on empty context lines.
    const emptyContext = (line === '' || line === '\r') && i < lines.length - 1
    if (line.startsWith('-') && oldLeft > 0) {
      oldLeft--
    }
    else if (line.startsWith('+') && newLeft > 0) {
      newLeft--
    }
    else if ((line.startsWith(' ') || emptyContext) && oldLeft > 0 && newLeft > 0) {
      oldLeft--
      newLeft--
    }
    else {
      break
    }
  }
  return i
}

/** A format-patch commit message can quote another diff before Git's separator and diffstat. */
function stripMailPreambles(text: string): string {
  const mailHeader = /(?=^From [\da-f]+ Mon Sep 17 00:00:00 2001$)/m
  if (!text.startsWith('From ') || !mailHeader.test(text))
    return text

  return text.split(mailHeader).map((message) => {
    const stat = /^---\n(?: [^\n]*\n)+\n(?=diff --git )/m.exec(message)
    // Keep the actual mbox separator between adjacent patches. It ends the
    // preceding hunk even if the sender generated the series without a signature.
    return stat ? message.slice(0, message.indexOf('\n') + 1) + message.slice(stat.index + stat[0].length) : message
  }).join('')
}

function splitFileChunks(text: string): { chunks: string[], isGitDiff: boolean } {
  text = stripMailPreambles(text)
  if (/^diff --git /m.test(text)) {
    const chunks = text.split(/(?=^diff --git )/m).filter(chunk => chunk.startsWith('diff --git '))
    return { chunks, isGitDiff: true }
  }

  const chunks: string[] = []
  const lines = text.split('\n')
  let start: number | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      if (start !== undefined)
        chunks.push(`${lines.slice(start, i).join('\n')}\n`)
      start = i
      i++
    }
    else if (start !== undefined) {
      const header = HUNK_HEADER_RE.exec(line)
      if (header)
        i = hunkEnd(lines, i + 1, header) - 1
    }
  }
  // Keep the raw file chunk, including its final line ending, for existing content hashes.
  if (start !== undefined)
    chunks.push(lines.slice(start).join('\n'))
  else if (lines.some(line => line.trim() && !/^Only in .+: .+$/.test(line)))
    chunks.push(text)
  return { chunks, isGitDiff: false }
}

/** Parses `@@ ... @@` hunk blocks out of a list of diff lines (with or without a leading `diff --git`/`---`/`+++` preamble). */
function parseHunkSection(lines: string[], posix = false): HunkSection {
  let boundedDifferently = false
  const hunks: DiffHunk[] = []
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!
    const match = HUNK_HEADER_RE.exec(header)
    if (!match) {
      if (hunks.length && header !== '')
        boundedDifferently = true
      continue
    }
    const end = hunkEnd(lines, i + 1, match)
    const body = lines.slice(i + 1, end)
    // Older imports split even within a POSIX hunk at "--- " and trimmed
    // trailing blank context lines from each hunk.
    if ((posix && body.some(line => line.startsWith('--- '))) || (body.length > 1 && body.at(-1) === ''))
      boundedDifferently = true
    hunks.push({
      header,
      oldStart: Number(match[1]),
      oldLines: Number(match[2] ?? 1),
      newStart: Number(match[3]),
      newLines: Number(match[4] ?? 1),
      patch: body.join('\n'),
    })
    i = end - 1
  }
  return { hunks, boundedDifferently }
}

export function parseHunks(lines: string[]): DiffHunk[] {
  return parseHunkSection(lines).hunks
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
  const section = preamble.isBinary || preamble.hunkStartIndex === -1
    ? { hunks: [], boundedDifferently: false }
    : parseHunkSection(lines.slice(preamble.hunkStartIndex))

  return {
    path,
    previousPath,
    status,
    isBinary: preamble.isBinary,
    oldIndexSha: preamble.oldIndexSha,
    newIndexSha: preamble.newIndexSha,
    ...section,
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
  const section = hunkStartIndex === -1 ? { hunks: [], boundedDifferently: false } : parseHunkSection(lines.slice(hunkStartIndex), true)
  return { path, status, isBinary: false, ...section }
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
 * `FileChange`s. A paste can scope review marks for files whose hunk boundaries
 * changed, even when the same blob also occurs in other sources.
 */
export async function parsePatch(text: string, reviewScope?: string): Promise<FileChange[]> {
  const { chunks, isGitDiff } = splitFileChunks(text)

  return Promise.all(chunks.map(async (chunk, index) => {
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
      ...(reviewScope && parsed.boundedDifferently && { reviewKey: `${reviewScope}:${index}` }),
      hunks: parsed.hunks,
    } satisfies FileChange
  }))
}
