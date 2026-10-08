import type { RoutableRef } from './source-routes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { parentForRef, refFromRoute, repositoryRoute, repositoryRoutes, routeForRef, routeFromUrl, routes } from './source-routes'

const page = async () => ({})
const router = createRouter({ history: createMemoryHistory(), routes: [...repositoryRoutes(page), ...routes(page)] })

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
    expect(router.resolve('/gh/antfu/diffs/main').name).toBeUndefined()
  })

  it('gives a paste no route and no parent', () => {
    expect(routeForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
    expect(parentForRef({ kind: 'paste', hash: 'abc' })).toBeUndefined()
  })

  it('reads PR, compare, commit, repo and PR-list URLs from github.com', () => {
    expect(routeFromUrl('https://github.com/antfu/diffs/pull/12/files')).toBe('/gh/antfu/diffs/12')
    expect(routeFromUrl('https://github.com/antfu/diffs/compare/main...feat/x')).toBe('/gh/antfu/diffs/compare/main...feat/x')
    expect(routeFromUrl('https://github.com/antfu/diffs/commit/a1b2c3d?diff=split')).toBe('/gh/antfu/diffs/commit/a1b2c3d')
    expect(routeFromUrl('github.com/antfu/diffs')).toBe('/gh/antfu/diffs')
    expect(routeFromUrl('https://github.com/antfu/diffs/pulls')).toBe('/gh/antfu/diffs')
    expect(routeFromUrl('antfu/diffs#12')).toBe('/gh/antfu/diffs/12')
    expect(routeFromUrl('https://github.com/antfu/diffs/compare/main')).toBeUndefined()
    expect(routeFromUrl('https://example.com/antfu/diffs')).toBeUndefined()
  })

  it.each<Extract<RoutableRef, { kind: 'gitlab-mr' }>>([
    { kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/project', iid: '12' },
    { kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/sub-group/deeper/my.project', iid: '3' },
  ])('round-trips a merge request of $project through its route', (ref) => {
    const route = routeForRef(ref)
    expect(route).toBe(`/gl/${ref.project}/-/merge_requests/${ref.iid}`)
    expect(router.resolve(route).name).toBe('gitlab-mr')
    expect(refFromRoute(router.resolve(route))).toEqual(ref)
    expect(parentForRef(ref)).toEqual({ route: `/gl/${ref.project}`, label: ref.project })
  })

  it('routes a repository and a project of the same path to different lists', () => {
    const github = router.resolve(repositoryRoute({ kind: 'github-repo', owner: 'group', repo: 'project' }))
    const gitlab = router.resolve(repositoryRoute({ kind: 'gitlab-project', host: 'gitlab.com', project: 'group/sub/project' }))

    expect([github.name, github.path]).toEqual(['github-repo', '/gh/group/project'])
    expect([gitlab.name, gitlab.path]).toEqual(['gitlab-project', '/gl/group/sub/project'])
    expect(gitlab.params.project).toBe('group/sub/project')
  })

  it('never takes a merge request path, or another page of a project, for a project list', () => {
    expect(router.resolve('/gl/group/project/-/merge_requests/12').name).toBe('gitlab-mr')
    expect(router.resolve('/gl/group/project/-/merge_requests').name).toBeUndefined()
    expect(router.resolve('/gl/group/project/-/merge_requests/abc').name).toBeUndefined()
    expect(router.resolve('/gl/group').name).toBeUndefined()
  })

  it('keeps another instance out of the gitlab.com routes', () => {
    const route = routeForRef({ kind: 'gitlab-mr', host: 'gitlab.example.com', project: 'group/project', iid: '12' })
    expect(route).toBe('/gl/@gitlab.example.com/group/project/-/merge_requests/12')
    expect(router.resolve(route).name).toBeUndefined()
    expect(router.resolve('/gl/@gitlab.example.com/group/project').name).toBeUndefined()
  })

  it('reads merge request, project and shorthand forms from gitlab.com', () => {
    expect(routeFromUrl('https://gitlab.com/group/subgroup/project/-/merge_requests/123')).toBe('/gl/group/subgroup/project/-/merge_requests/123')
    expect(routeFromUrl('https://gitlab.com/group/subgroup/project/-/merge_requests/123/diffs#note_1')).toBe('/gl/group/subgroup/project/-/merge_requests/123')
    expect(routeFromUrl('group/subgroup/project!123')).toBe('/gl/group/subgroup/project/-/merge_requests/123')
    expect(routeFromUrl('https://gitlab.com/group/subgroup/project')).toBe('/gl/group/subgroup/project')
    expect(routeFromUrl('https://gitlab.com/group/subgroup/project/-/merge_requests')).toBe('/gl/group/subgroup/project')
    expect(routeFromUrl('https://gitlab.example.com/group/project/-/merge_requests/1')).toBeUndefined()
  })

  it('reads a GitLab project named like the GitHub host as a GitLab one', () => {
    expect(routeFromUrl('https://gitlab.com/github.com/owner/-/merge_requests/1')).toBe('/gl/github.com/owner/-/merge_requests/1')
  })
})

describe('a build for a self-managed GitLab instance', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function selfManaged() {
    vi.stubEnv('PR_GITLAB_HOST', 'gitlab.example.com')
    vi.resetModules()
    const built = await import('./source-routes')
    return { ...built, router: createRouter({ history: createMemoryHistory(), routes: [...built.repositoryRoutes(page), ...built.routes(page)] }) }
  }

  it('opens that instance under /gl/, and reads its URLs', async () => {
    const { refFromRoute, routeFromUrl, router } = await selfManaged()

    expect(routeFromUrl('https://gitlab.example.com/group/sub/project/-/merge_requests/5')).toBe('/gl/group/sub/project/-/merge_requests/5')
    expect(routeFromUrl('https://gitlab.example.com/group/sub/project')).toBe('/gl/group/sub/project')
    expect(refFromRoute(router.resolve('/gl/group/sub/project/-/merge_requests/5')))
      .toEqual({ kind: 'gitlab-mr', host: 'gitlab.example.com', project: 'group/sub/project', iid: '5' })
  })

  it('leaves gitlab.com to a build made for it', async () => {
    const { routeForRef, routeFromUrl, router } = await selfManaged()

    expect(routeFromUrl('https://gitlab.com/group/project/-/merge_requests/5')).toBeUndefined()
    const route = routeForRef({ kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/project', iid: '5' })
    expect(route).toBe('/gl/@gitlab.com/group/project/-/merge_requests/5')
    expect(router.resolve(route).name).toBeUndefined()
  })
})
