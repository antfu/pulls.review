import type { SourceRef } from '@pulls.review/core/types'
import type { RouteComponent, RouteLocation, RouteRecordRaw } from 'vue-router'
import { parseGithubUrl, splitRange } from '@pulls.review/core/github'

/**
 * The one place that maps diff refs to app routes and back. Components link through
 * these helpers instead of spelling out `/gh/...` paths.
 */

/** Every ref kind with a page of its own in this build. */
export type RoutableRef = Extract<SourceRef, { kind: 'github-pr' | 'github-compare' | 'github-commit' }>

/** One route per routable ref kind, named after the kind so a route reads back into its ref. */
export function routes(component: () => Promise<RouteComponent>): RouteRecordRaw[] {
  // The page receives its ref as the `sourceRef` prop rather than reading the route.
  const props = (route: RouteLocation) => ({ sourceRef: refFromRoute(route) })
  return [
    { name: 'github-pr', path: '/gh/:owner/:repo/:number(\\d+)', component, props },
    // A range is `base...head`; either side may be a branch with slashes.
    { name: 'github-compare', path: '/gh/:owner/:repo/compare/:range(.+\\.\\.\\..+)', component, props },
    { name: 'github-commit', path: '/gh/:owner/:repo/commit/:sha', component, props },
  ]
}

export function routeForRef(ref: RoutableRef): string
export function routeForRef(ref: SourceRef): string | undefined
export function routeForRef(ref: SourceRef): string | undefined {
  switch (ref.kind) {
    case 'github-pr':
      return `/gh/${ref.owner}/${ref.repo}/${ref.number}`
    case 'github-compare':
      return `/gh/${ref.owner}/${ref.repo}/compare/${ref.base}...${ref.head}`
    case 'github-commit':
      return `/gh/${ref.owner}/${ref.repo}/commit/${ref.sha}`
    case 'paste':
      // Deliberately unroutable: a paste has no live source to reopen from a link.
      return undefined
    case 'local':
      // Only the local server can open it (plans/09).
      return undefined
  }
}

export function refFromRoute(route: Pick<RouteLocation, 'name' | 'params'>): RoutableRef | undefined {
  const param = (name: string) => String(route.params[name])
  const owner = param('owner')
  const repo = param('repo')
  switch (route.name) {
    case 'github-pr':
      return { kind: 'github-pr', owner, repo, number: param('number') }
    case 'github-compare': {
      const range = splitRange(param('range'))
      return range && { kind: 'github-compare', owner, repo, ...range }
    }
    case 'github-commit':
      return { kind: 'github-commit', owner, repo, sha: param('sha') }
  }
}

export function repoRoute(owner: string, repo: string): string {
  return `/gh/${owner}/${repo}`
}

/** Where a diff sits, e.g. its repo's PR list - `undefined` for a ref with no parent view. */
export function parentForRef(ref: SourceRef): { route: string, label: string } | undefined {
  return ref.kind === 'paste' || ref.kind === 'local'
    ? undefined
    : { route: repoRoute(ref.owner, ref.repo), label: `${ref.owner}/${ref.repo}` }
}

/**
 * A pasted github.com URL (or `owner/repo#123`) as an app route: a PR, compare or
 * commit opens its diff, a bare repo (or its `/pulls`) the PR list.
 */
export function routeFromGithubUrl(text: string): string | undefined {
  const location = parseGithubUrl(text)
  if (!location)
    return undefined
  return location.kind === 'github-repo' ? repoRoute(location.owner, location.repo) : routeForRef(location)
}
