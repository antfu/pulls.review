import { describe, expect, it } from 'vitest'
import { parentForRef, pullRequestRefFromRoute, routeForRef, routeFromGithubUrl } from './source-routes'

describe('source routes', () => {
  it('round-trips a pull request ref through its route params', () => {
    const ref = { kind: 'github-pr', owner: 'antfu', repo: 'diffs', number: '12' } as const
    expect(routeForRef(ref)).toBe('/gh/antfu/diffs/12')
    expect(pullRequestRefFromRoute({ owner: 'antfu', repo: 'diffs', number: '12' })).toEqual(ref)
    expect(parentForRef(ref)).toEqual({ route: '/gh/antfu/diffs', label: 'antfu/diffs' })
  })

  it('gives a paste no route and no parent', () => {
    expect(routeForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
    expect(parentForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
  })

  it('reads PR, repo and PR-list URLs from github.com', () => {
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/pull/12/files')).toBe('/gh/antfu/diffs/12')
    expect(routeFromGithubUrl('github.com/antfu/diffs')).toBe('/gh/antfu/diffs')
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/pulls')).toBe('/gh/antfu/diffs')
    expect(routeFromGithubUrl('https://example.com/antfu/diffs')).toBeUndefined()
  })
})
