import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { resolver } from 'vue-router/auto-resolver'
import { experimental_createRouter as createRouter } from 'vue-router/experimental'
import { routeForPage } from './pages'

const router = createRouter({ history: createMemoryHistory(), resolver })

describe('local page routes', () => {
  it('preserves a valid branch name containing #', () => {
    const route = router.resolve(routeForPage({ kind: 'branch', branch: 'feature#topic' }))
    expect(route.hash).toBe('')
    expect(route.name).toBe('local-branch')
    expect(route.params).toEqual({ branch: { kind: 'branch', branch: 'feature#topic' } })
  })

  it('preserves # in a local compare range', () => {
    const route = router.resolve(routeForPage({ kind: 'compare', range: 'main...feature#topic' }))
    expect(route.hash).toBe('')
    expect(route.name).toBe('local-compare')
    expect(route.params).toEqual({ range: { kind: 'compare', range: 'main...feature#topic' } })
  })

  it.each(['feature%topic', 'feat/x'])('preserves the %s branch route', (branch) => {
    const route = router.resolve(routeForPage({ kind: 'branch', branch }))
    expect(route.params).toEqual({ branch: { kind: 'branch', branch } })
  })

  it.each(['main..feature/topic', 'main...feature/topic', 'HEAD~2'])('preserves the %s comparison target', (range) => {
    const route = router.resolve(routeForPage({ kind: 'compare', range }))
    expect(route.params).toEqual({ range: { kind: 'compare', range } })
  })

  it('opens a local commit with its parsed page', () => {
    const route = router.resolve(routeForPage({ kind: 'commit', sha: 'a1b2c3d' }))
    expect(route.name).toBe('local-commit')
    expect(route.params).toEqual({ sha: { kind: 'commit', sha: 'a1b2c3d' } })
  })

  it('opens the worktree without a target parameter', () => {
    const route = router.resolve(routeForPage({ kind: 'worktree' }))
    expect(route.name).toBe('local-worktree')
    expect(route.params).toEqual({})
  })

  it('builds a branch URL from a typed target', () => {
    const route = router.resolve({ name: 'local-branch', params: { branch: { kind: 'branch', branch: 'feature/topic' } } })
    expect(route.path).toBe('/branch/feature%2Ftopic')
    expect(route.params).toEqual({ branch: { kind: 'branch', branch: 'feature/topic' } })
    expect(router.resolve(route.path).params).toEqual({ branch: { kind: 'branch', branch: 'feature/topic' } })
  })
})
