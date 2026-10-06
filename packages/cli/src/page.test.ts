import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageFor } from './page'

let repo: string

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pulls-review-page-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  writeFileSync(join(repo, 'a.ts'), 'one\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('pageFor', () => {
  it('opens the picker on the default branch, and the current branch anywhere else', async () => {
    expect(await pageFor(repo, undefined, false)).toBe('/')
    git('switch', '-q', '-c', 'feat/x')
    expect(await pageFor(repo, undefined, false)).toBe('/branch/feat/x')
  })

  it('maps an argument by its shape', async () => {
    git('branch', 'topic')
    expect(await pageFor(repo, 'main...topic', false)).toBe('/compare/main...topic')
    expect(await pageFor(repo, 'v1..v2', false)).toBe('/compare/v1..v2')
    expect(await pageFor(repo, 'topic', false)).toBe('/branch/topic')
    expect(await pageFor(repo, 'HEAD', false)).toBe('/commit/HEAD')
    expect(await pageFor(repo, 'topic', true)).toBe('/worktree')
  })

  it('opens a GitHub target on the site\'s route, without consulting git', async () => {
    expect(await pageFor(repo, 'antfu/diffs#12', false)).toBe('/gh/antfu/diffs/12')
    expect(await pageFor(repo, 'https://github.com/antfu/diffs/pull/12/files', false)).toBe('/gh/antfu/diffs/12')
    expect(await pageFor(repo, 'https://github.com/antfu/diffs/compare/main...feat/x', false)).toBe('/gh/antfu/diffs/compare/main...feat/x')
    expect(await pageFor(repo, 'https://github.com/antfu/diffs/commit/a1b2c3d', false)).toBe('/gh/antfu/diffs/commit/a1b2c3d')
    expect(await pageFor(repo, 'https://github.com/antfu/diffs', false)).toBe('/gh/antfu/diffs')
  })

  it('rejects a revision that would read as an option', async () => {
    await expect(pageFor(repo, '--all', false)).rejects.toThrow(/Invalid revision/)
  })
})
