import type { Commit, DiffsPayload } from '../types/diff'
import type { DiffSource } from '../types/source'
import type { LocalTarget } from './target'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { computeContentHash, parsePatch } from '../patch-parser'
import { serializeRef } from '../types/source'
import { git, tryGit } from './git'
import { parseTarget } from './target'

/** Pinned so `patch-parser` always reads the same shape: no colors, no external tools, plain prefixes, full blob shas. */
const DIFF_ARGS = ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '--full-index', '-M']
/** A file's patch past this is dropped to its counts; the full file can still be loaded. */
const MAX_PATCH_BYTES = 512 * 1024
/** The working tree has no sha; its side of a diff is named by a hash of the diff itself. */
const WORKTREE_PREFIX = 'worktree:'

interface Resolved {
  base: string
  /** `undefined` for the working tree. */
  head?: string
  title: string
  commits: Commit[]
}

async function revParse(root: string, rev: string): Promise<string> {
  return (await git(root, ['rev-parse', '--verify', `${rev}^{commit}`])).trim()
}

async function emptyTree(root: string): Promise<string> {
  return (await git(root, ['hash-object', '-t', 'tree', devNull])).trim()
}

/** `base..head`, oldest first; `%x00`/`%x1e` keep multi-line messages intact. */
async function commitsBetween(root: string, range: string[]): Promise<Commit[]> {
  const log = await git(root, ['log', '--reverse', '--format=%H%x00%B%x1e', ...range, '--'])
  return log.split('\x1E').map(entry => entry.trim()).filter(Boolean).map((entry) => {
    const [sha = '', message = ''] = entry.split('\0')
    return { sha, message: message.trim() }
  })
}

async function resolveTarget(root: string, target: LocalTarget, text: string): Promise<Resolved> {
  switch (target.kind) {
    case 'worktree': {
      const head = await tryGit(root, ['rev-parse', '--verify', '-q', 'HEAD'])
      return { base: head?.trim() || await emptyTree(root), title: 'Working tree', commits: [] }
    }
    case 'commit': {
      const sha = await revParse(root, target.rev)
      const parent = (await tryGit(root, ['rev-parse', '--verify', '-q', `${sha}^`]))?.trim()
      const commits = await commitsBetween(root, ['-1', sha])
      return { base: parent || await emptyTree(root), head: sha, title: commits[0]?.message.split('\n')[0] ?? text, commits }
    }
    case 'range': {
      const head = await revParse(root, target.head)
      const base = target.mergeBase
        ? (await git(root, ['merge-base', await revParse(root, target.base), head])).trim()
        : await revParse(root, target.base)
      return { base, head, title: text, commits: await commitsBetween(root, [`${base}..${head}`]) }
    }
  }
}

/**
 * The working tree against `base`, untracked files included: they are marked
 * intent-to-add in a throwaway copy of the index, so the user's own index is never touched.
 */
async function worktreeDiff(root: string, base: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pulls-review-'))
  try {
    const index = join(dir, 'index')
    const realIndex = resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim())
    await copyFile(realIndex, index).catch(() => {})
    const env = { GIT_INDEX_FILE: index }
    await git(root, ['add', '--intent-to-add', '--', '.'], { env })
    return await git(root, [...DIFF_ARGS, base, '--'], { env })
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Drops the hunks of every chunk past `MAX_PATCH_BYTES`, keeping its header and line counts. */
function truncateLargeChunks(text: string): { text: string, truncated: Map<number, { additions: number, deletions: number }> } {
  const truncated = new Map<number, { additions: number, deletions: number }>()
  const chunks = text.split(/(?=^diff --git )/m).filter(chunk => chunk.trim())
  const kept = chunks.map((chunk, index) => {
    if (chunk.length <= MAX_PATCH_BYTES)
      return chunk
    const lines = chunk.split('\n')
    const firstHunk = lines.findIndex(line => line.startsWith('@@ '))
    const body = lines.slice(firstHunk)
    truncated.set(index, {
      additions: body.filter(line => line.startsWith('+')).length,
      deletions: body.filter(line => line.startsWith('-')).length,
    })
    return `${lines.slice(0, firstHunk).join('\n')}\n`
  })
  return { text: kept.join(''), truncated }
}

export interface LocalSourceOptions {
  /** Any directory inside the repository. */
  cwd: string
  /** Git revision syntax (see plans/04); `''` is the working tree. */
  target: string
}

/** A local repository through `git` (Node only). No reviews or sharing: a local diff has no review lifecycle. */
export function createLocalSource({ cwd, target }: LocalSourceOptions): DiffSource {
  const parsed = parseTarget(target)
  const root = git(cwd, ['rev-parse', '--show-toplevel']).then(out => out.trim())

  async function diffText(resolved: Resolved): Promise<string> {
    return resolved.head
      ? git(await root, [...DIFF_ARGS, resolved.base, resolved.head, '--'])
      : worktreeDiff(await root, resolved.base)
  }

  async function headSha(resolved: Resolved, text: string): Promise<string> {
    return resolved.head ?? `${WORKTREE_PREFIX}${await computeContentHash(text)}`
  }

  return {
    key: async () => serializeRef({ kind: 'local', repo: await root, target }),
    async fetch(): Promise<DiffsPayload> {
      const repo = await root
      const resolved = await resolveTarget(repo, parsed, target)
      const text = await diffText(resolved)
      const { text: kept, truncated } = truncateLargeChunks(text)
      const files = (await parsePatch(kept)).map((file, index) => {
        const counts = truncated.get(index)
        return counts ? { ...file, ...counts, truncated: true as const } : file
      })
      const head = await headSha(resolved, text)
      return {
        ref: { kind: 'local', repo, target },
        title: resolved.title,
        label: target || 'working tree',
        base: { sha: resolved.base, ref: parsed.kind === 'range' ? parsed.base : resolved.base.slice(0, 7) },
        head: { sha: head, ref: parsed.kind === 'range' ? parsed.head : parsed.kind === 'commit' ? parsed.rev : 'working tree' },
        commits: resolved.commits,
        files,
      }
    },
    async fingerprint() {
      const resolved = await resolveTarget(await root, parsed, target)
      return resolved.head ?? headSha(resolved, await diffText(resolved))
    },
    async loadFile(path, sha) {
      const repo = await root
      if (sha.startsWith(WORKTREE_PREFIX))
        return readFile(join(repo, path), 'utf8').catch(() => undefined)
      if (await tryGit(repo, ['cat-file', '-e', `${sha}:${path}`]) === undefined)
        return undefined
      return git(repo, ['cat-file', 'blob', `${sha}:${path}`])
    },
  }
}
