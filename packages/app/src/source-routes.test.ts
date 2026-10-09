import type { RoutableRef } from './source-routes'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { resolver } from 'vue-router/auto-resolver'
import { experimental_createRouter as createRouter } from 'vue-router/experimental'
import { parentForRef, refFromRoute, routeForRef, routeFromGithubUrl } from './source-routes'

const router = createRouter({ history: createMemoryHistory(), resolver })

describe('source routes', () => {
  it.each<RoutableRef>([
    { kind: 'github-pr', owner: 'antfu', repo: 'diffs', number: '12' },
    { kind: 'github-compare', owner: 'antfu', repo: 'diffs', base: 'main', head: 'feat/nested-branch' },
    { kind: 'github-compare', owner: 'antfu', repo: 'diffs', base: 'v1.0.0', head: 'a1b2c3d' },
    { kind: 'github-commit', owner: 'antfu', repo: 'diffs', sha: 'a1b2c3d4' },
  ])('round-trips a $kind ref through its route', (ref) => {
    expect(refFromRoute(router.resolve(routeForRef(ref)))).toEqual(ref)
    expect(parentForRef(ref)).toEqual({ route: '/gh/antfu/diffs', label: 'antfu/diffs' })
  })

  it('does not take a non-numeric segment for a pull request', () => {
    expect(router.resolve('/gh/antfu/diffs/main').matched).toEqual([])
  })

  it('builds a compare URL from rich params', () => {
    const route = router.resolve({
      name: 'github-compare',
      params: { owner: 'antfu', repo: 'diffs', range: { base: 'main', head: 'feat/topic' } },
    })
    expect(refFromRoute(route)).toEqual({ kind: 'github-compare', owner: 'antfu', repo: 'diffs', base: 'main', head: 'feat/topic' })
  })

  it.each(['/branch/main', '/compare/main...head', '/worktree', '/gh/antfu/diffs/compare/main', '/gh/antfu/diffs/compare/...head'])('does not match %s in the website', (path) => {
    expect(router.resolve(path).matched).toEqual([])
  })

  it('gives a paste no route and no parent', () => {
    expect(routeForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
    expect(parentForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
  })

  it('reads PR, compare, commit, repo and PR-list URLs from github.com', () => {
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/pull/12/files')).toBe('/gh/antfu/diffs/12')
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/compare/main...feat/x')).toBe('/gh/antfu/diffs/compare/main...feat/x')
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/commit/a1b2c3d?diff=split')).toBe('/gh/antfu/diffs/commit/a1b2c3d')
    expect(routeFromGithubUrl('github.com/antfu/diffs')).toBe('/gh/antfu/diffs')
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/pulls')).toBe('/gh/antfu/diffs')
    expect(routeFromGithubUrl('antfu/diffs#12')).toBe('/gh/antfu/diffs/12')
    expect(routeFromGithubUrl('https://github.com/antfu/diffs/compare/main')).toBeUndefined()
    expect(routeFromGithubUrl('https://example.com/antfu/diffs')).toBeUndefined()
  })
})
