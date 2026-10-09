import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPasteSource } from '../providers/paste'
import { createLocalSource } from './source'

let repo: string

function sh(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function write(path: string, content: string) {
  mkdirSync(join(repo, path, '..'), { recursive: true })
  writeFileSync(join(repo, path), content)
}

function commit(message: string): string {
  sh('add', '--all')
  sh('commit', '-q', '-m', message)
  return sh('rev-parse', 'HEAD')
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pulls-review-test-'))
  sh('init', '-q', '-b', 'main')
  sh('config', 'user.email', 'dev@example.com')
  sh('config', 'user.name', 'Dev')
  sh('config', 'commit.gpgsign', 'false')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('local source', () => {
  it('diffs the working tree against HEAD with untracked files, leaving the real index alone', async () => {
    write('a.ts', 'one\n')
    const head = commit('init')
    write('a.ts', 'two\n')
    write('new/b.ts', 'fresh\n')
    const statusBefore = sh('status', '--porcelain')

    const source = createLocalSource({ cwd: join(repo, 'new', '..'), target: '' })
    const diff = await source.fetch()

    expect(diff.ref).toEqual({ kind: 'local', repo: sh('rev-parse', '--show-toplevel'), target: '' })
    expect(diff.base?.sha).toBe(head)
    expect(diff.head?.sha).toMatch(/^worktree:/)
    expect(diff.files.map(f => [f.path, f.status])).toEqual([['a.ts', 'modified'], ['new/b.ts', 'added']])
    expect(diff.files[1]!.sha).toBe(sh('hash-object', 'new/b.ts'))
    expect(sh('status', '--porcelain')).toBe(statusBefore)
    expect(await source.fingerprint!()).toBe(diff.head!.sha)
    expect(await source.loadFile!('a.ts', diff.head!.sha)).toBe('two\n')
    expect(await source.loadFile!('a.ts', diff.base!.sha)).toBe('one\n')
    expect(await source.loadFile!('../outside.txt', diff.head!.sha)).toBeUndefined()
  })

  it('moves the working-tree fingerprint when HEAD moves under an unchanged diff', async () => {
    write('a.ts', 'one\n')
    commit('init')
    write('b.ts', 'b\n')
    commit('second')
    write('a.ts', 'two\n')
    const source = createLocalSource({ cwd: repo, target: '' })
    const before = await source.fingerprint()
    sh('stash', '-q')
    sh('reset', '-q', '--hard', 'HEAD~1')
    sh('stash', 'pop', '-q')
    expect(await source.fingerprint()).not.toBe(before)
  })

  it('moves the working-tree fingerprint when a file changes again', async () => {
    write('a.ts', 'one\n')
    commit('init')
    write('a.ts', 'two\n')
    const source = createLocalSource({ cwd: repo, target: '' })
    const before = await source.fingerprint!()
    write('a.ts', 'three\n')
    expect(await source.fingerprint!()).not.toBe(before)
  })

  it('diffs one commit against its parent, and a root commit against the empty tree', async () => {
    write('a.ts', 'one\n')
    const root = commit('init')
    write('a.ts', 'two\n')
    const second = commit('feat: change a\n\nbecause')

    const diff = await createLocalSource({ cwd: repo, target: 'HEAD' }).fetch()
    expect(diff).toMatchObject({ title: 'feat: change a', label: 'HEAD', base: { sha: root }, head: { sha: second }, commits: [{ sha: second, message: 'feat: change a\n\nbecause', author: { name: 'Dev' } }] })
    expect(diff.commits?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const initial = await createLocalSource({ cwd: repo, target: root }).fetch()
    expect(initial.files.map(f => [f.path, f.status])).toEqual([['a.ts', 'added']])
  })

  it('diffs A...B against the merge base and A..B as trees', async () => {
    write('a.ts', 'one\n')
    const base = commit('init')
    sh('switch', '-q', '-c', 'feat')
    write('feat.ts', 'feat\n')
    const feat = commit('feat')
    sh('switch', '-q', 'main')
    write('main.ts', 'main\n')
    commit('main moves on')

    const threeDot = await createLocalSource({ cwd: repo, target: 'main...feat' }).fetch()
    expect(threeDot.base?.sha).toBe(base)
    expect(threeDot.files.map(f => f.path)).toEqual(['feat.ts'])
    expect(threeDot.commits?.map(c => c.sha)).toEqual([feat])

    const twoDot = await createLocalSource({ cwd: repo, target: 'main..feat' }).fetch()
    expect(twoDot.files.map(f => [f.path, f.status])).toEqual([['feat.ts', 'added'], ['main.ts', 'removed']])
  })

  it('keeps renames, binary files and quoted paths', async () => {
    write('old.ts', 'same content\n'.repeat(10))
    write('logo.bin', 'x')
    commit('init')
    sh('mv', 'old.ts', 'new.ts')
    writeFileSync(join(repo, 'logo.bin'), Buffer.from([0, 1, 2, 0]))
    write('say "hi".txt', 'hi\n')

    const diff = await createLocalSource({ cwd: repo, target: '' }).fetch()
    const byPath = new Map(diff.files.map(f => [f.path, f]))
    expect(byPath.get('new.ts')).toMatchObject({ status: 'renamed', previousPath: 'old.ts' })
    expect(byPath.get('logo.bin')?.isBinary).toBe(true)
    expect(byPath.get('say "hi".txt')?.status).toBe('added')
  })

  it('drops the hunks of a very large patch but keeps its counts', async () => {
    write('big.txt', '')
    commit('init')
    write('big.txt', 'x'.repeat(100).concat('\n').repeat(6000))

    const [big] = (await createLocalSource({ cwd: repo, target: '' }).fetch()).files
    expect(big).toMatchObject({ path: 'big.txt', truncated: true, additions: 6000, deletions: 0, hunks: [] })
  })

  it('parses the same as a pasted `git diff` of the same change', async () => {
    write('a.ts', 'one\ntwo\n')
    commit('init')
    write('a.ts', 'one\nthree\n')
    const pasted = execFileSync('git', ['diff', '--full-index'], { cwd: repo, encoding: 'utf8' })

    const local = await createLocalSource({ cwd: repo, target: '' }).fetch()
    expect(local.files).toEqual((await createPasteSource(pasted).fetch()).files)
  })

  it('rejects a revision that would read as an option', () => {
    expect(() => createLocalSource({ cwd: repo, target: '--output=x' })).toThrow(/Invalid revision/)
  })

  it('reports a missing file at a sha as undefined', async () => {
    write('a.ts', 'one\n')
    const sha = commit('init')
    expect(await createLocalSource({ cwd: repo, target: '' }).loadFile!('missing.ts', sha)).toBeUndefined()
    expect(readFileSync(join(repo, 'a.ts'), 'utf8')).toBe('one\n')
  })
})
