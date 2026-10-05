import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isLocalBranch, readRepoInfo, resolveDefaultBranch } from './repo'

let dir: string

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function init(path: string, branch: string) {
  git(dir, 'init', '-q', '-b', branch, path)
  const cwd = join(dir, path)
  git(cwd, 'config', 'user.email', 'dev@example.com')
  git(cwd, 'config', 'user.name', 'Dev')
  writeFileSync(join(cwd, 'a.ts'), 'one\n')
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-q', '-m', 'init')
  return cwd
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pulls-review-repo-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('repo info', () => {
  it('reads the current branch, branches and recent commits, with main as the default', async () => {
    const repo = init('repo', 'main')
    git(repo, 'switch', '-q', '-c', 'feat')

    expect(await readRepoInfo(repo)).toMatchObject({
      currentBranch: 'feat',
      defaultBranch: { name: 'main', ref: 'main' },
      branches: expect.arrayContaining(['main', 'feat']),
      commits: [{ subject: 'init' }],
    })
    expect(await isLocalBranch(repo, 'feat')).toBe(true)
    expect(await isLocalBranch(repo, 'HEAD')).toBe(false)
  })

  it('falls back to master, and has no default without either', async () => {
    expect(await resolveDefaultBranch(init('legacy', 'master'))).toEqual({ name: 'master', ref: 'master' })
    expect(await resolveDefaultBranch(init('other', 'trunk'))).toBeUndefined()
  })

  it('follows origin/HEAD and compares through the remote branch', async () => {
    init('upstream', 'trunk')
    git(dir, 'clone', '-q', 'upstream', 'clone')
    expect(await resolveDefaultBranch(join(dir, 'clone'))).toEqual({ name: 'trunk', ref: 'origin/trunk' })
  })
})
