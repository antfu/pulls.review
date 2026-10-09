import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { localRoutes, routeForPage } from './pages'

const router = createRouter({ history: createMemoryHistory(), routes: localRoutes(async () => ({})) })

describe('local page routes', () => {
  it('preserves a valid branch name containing #', () => {
    const route = router.resolve(routeForPage({ kind: 'branch', branch: 'feature#topic' }))
    expect(route.hash).toBe('')
    expect(route.params.branch).toBe('feature#topic')
  })

  it('preserves # in a local compare range', () => {
    const route = router.resolve(routeForPage({ kind: 'compare', range: 'main...feature#topic' }))
    expect(route.hash).toBe('')
    expect(route.params.range).toBe('main...feature#topic')
  })

  it.each(['feature%topic', 'feat/x'])('preserves the %s branch route', (branch) => {
    const route = router.resolve(routeForPage({ kind: 'branch', branch }))
    expect(route.params.branch).toBe(branch)
  })
})
