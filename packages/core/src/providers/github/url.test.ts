import { describe, expect, it } from 'vitest'
import { parseGithubUrl } from './url'

describe('parseGithubUrl', () => {
  it('reads PR, compare, commit, repo and PR-list URLs from github.com', () => {
    expect(parseGithubUrl('https://github.com/antfu/diffs/pull/12/files')).toEqual({ kind: 'github-pr', owner: 'antfu', repo: 'diffs', number: '12' })
    expect(parseGithubUrl('https://github.com/antfu/diffs/compare/main...feat/x')).toEqual({ kind: 'github-compare', owner: 'antfu', repo: 'diffs', base: 'main', head: 'feat/x' })
    expect(parseGithubUrl('https://github.com/antfu/diffs/commit/a1b2c3d?diff=split')).toEqual({ kind: 'github-commit', owner: 'antfu', repo: 'diffs', sha: 'a1b2c3d' })
    expect(parseGithubUrl('github.com/antfu/diffs')).toEqual({ kind: 'github-repo', owner: 'antfu', repo: 'diffs' })
    expect(parseGithubUrl('https://github.com/antfu/diffs/pulls')).toEqual({ kind: 'github-repo', owner: 'antfu', repo: 'diffs' })
  })

  it('reads the owner/repo#number shorthand', () => {
    expect(parseGithubUrl(' antfu/diffs#12 ')).toEqual({ kind: 'github-pr', owner: 'antfu', repo: 'diffs', number: '12' })
    expect(parseGithubUrl('antfu/diffs#')).toBeUndefined()
  })

  it('rejects what is neither', () => {
    expect(parseGithubUrl('https://github.com/antfu/diffs/compare/main')).toBeUndefined()
    expect(parseGithubUrl('https://example.com/antfu/diffs')).toBeUndefined()
    expect(parseGithubUrl('main...feat/x')).toBeUndefined()
    expect(parseGithubUrl('feat/x')).toBeUndefined()
  })
})
