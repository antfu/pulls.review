import type { RepositoryRef, SourceRef } from '@pulls.review/core/types'
import type { RouteComponent, RouteLocation, RouteRecordRaw } from 'vue-router'
import { parseGithubUrl, splitRange } from '@pulls.review/core/github'
import { parseGitlabUrl } from '@pulls.review/core/gitlab'
import { GITLAB_HOST } from './gitlab-host'

/**
 * The one place that maps diff refs to app routes and back. Components link through
 * these helpers instead of spelling out `/gh/...` or `/gl/...` paths.
 */

/** Every ref kind with a page of its own in this build. */
export type RoutableRef = Extract<SourceRef, { kind: 'github-pr' | 'github-compare' | 'github-commit' | 'gitlab-mr' }>

/**
 * A project path on this build's GitLab instance: two or more segments, to any depth.
 * No segment after the first starts with `-`, so the `/-/` before a project's own
 * pages ends it. The first never starts with `@`: `/gl/@host/...` names any other
 * instance, which has no route.
 */
// vue-router ends a param's pattern at the first `)`, so the inner group's is escaped.
const GITLAB_PROJECT = ':project([^/@][^/]*(?:/[^/-][^/]*\\)+)'

/** One route per routable ref kind, named after the kind so a route reads back into its ref. */
export function routes(component: () => Promise<RouteComponent>): RouteRecordRaw[] {
  // The page receives its ref as the `sourceRef` prop rather than reading the route.
  const props = (route: RouteLocation) => ({ sourceRef: refFromRoute(route) })
  return [
    { name: 'github-pr', path: '/gh/:owner/:repo/:number(\\d+)', component, props },
    // A range is `base...head`; either side may be a branch with slashes.
    { name: 'github-compare', path: '/gh/:owner/:repo/compare/:range(.+\\.\\.\\..+)', component, props },
    { name: 'github-commit', path: '/gh/:owner/:repo/commit/:sha', component, props },
    { name: 'gitlab-mr', path: `/gl/${GITLAB_PROJECT}/-/merge_requests/:iid(\\d+)`, component, props },
  ]
}

/** One list route per host, named after the repository kind; the page receives its `repository` as a prop. */
export function repositoryRoutes(component: () => Promise<RouteComponent>): RouteRecordRaw[] {
  const props = (route: RouteLocation) => ({ repository: repositoryFromRoute(route) })
  return [
    { name: 'github-repo', path: '/gh/:owner/:repo', component, props },
    { name: 'gitlab-project', path: `/gl/${GITLAB_PROJECT}`, component, props },
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
    case 'gitlab-mr':
      return `${gitlabRoot(ref.host)}${ref.project}/-/merge_requests/${ref.iid}`
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
  switch (route.name) {
    case 'github-pr':
      return { kind: 'github-pr', owner: param('owner'), repo: param('repo'), number: param('number') }
    case 'github-compare': {
      const range = splitRange(param('range'))
      return range && { kind: 'github-compare', owner: param('owner'), repo: param('repo'), ...range }
    }
    case 'github-commit':
      return { kind: 'github-commit', owner: param('owner'), repo: param('repo'), sha: param('sha') }
    case 'gitlab-mr':
      return { kind: 'gitlab-mr', host: GITLAB_HOST, project: param('project'), iid: param('iid') }
  }
}

function repositoryFromRoute(route: Pick<RouteLocation, 'name' | 'params'>): RepositoryRef | undefined {
  switch (route.name) {
    case 'github-repo':
      return { kind: 'github-repo', owner: String(route.params.owner), repo: String(route.params.repo) }
    case 'gitlab-project':
      return { kind: 'gitlab-project', host: GITLAB_HOST, project: String(route.params.project) }
  }
}

/** A repository's pull request list. */
export function repositoryRoute(repository: RepositoryRef): string {
  return repository.kind === 'github-repo'
    ? `/gh/${repository.owner}/${repository.repo}`
    : `${gitlabRoot(repository.host)}${repository.project}`
}

/** Paths of this build's instance sit directly under `/gl/`; any other is named by an `@host` segment. */
function gitlabRoot(host: string): string {
  return host === GITLAB_HOST ? '/gl/' : `/gl/@${host}/`
}

/** A repository as its namespace and its own name, the way a header or a pill shows it. */
export function repositoryName(repository: RepositoryRef): { owner: string, name: string } {
  if (repository.kind === 'github-repo')
    return { owner: repository.owner, name: repository.repo }
  const slash = repository.project.lastIndexOf('/')
  return { owner: repository.project.slice(0, slash), name: repository.project.slice(slash + 1) }
}

function repositoryOf(ref: SourceRef): RepositoryRef | undefined {
  switch (ref.kind) {
    case 'github-pr':
    case 'github-compare':
    case 'github-commit':
      return { kind: 'github-repo', owner: ref.owner, repo: ref.repo }
    case 'gitlab-mr':
      return { kind: 'gitlab-project', host: ref.host, project: ref.project }
  }
}

/** Where a diff sits, e.g. its repo's PR list - `undefined` for a ref with no parent view. */
export function parentForRef(ref: SourceRef): { route: string, label: string } | undefined {
  const repository = repositoryOf(ref)
  if (!repository)
    return undefined
  const { owner, name } = repositoryName(repository)
  return { route: repositoryRoute(repository), label: `${owner}/${name}` }
}

/**
 * A pasted URL of github.com or of this build's GitLab instance (or the
 * `owner/repo#123` and `group/project!123` shorthands) as an app route: a pull request, merge request,
 * compare or commit opens its diff, a repository or project its list.
 */
export function routeFromUrl(text: string): string | undefined {
  // GitLab first: a project may be named like a host, and `gitlab.com/github.com/...` is a GitLab URL.
  const gitlab = parseGitlabUrl(text, GITLAB_HOST)
  if (gitlab)
    return gitlab.kind === 'gitlab-project' ? repositoryRoute(gitlab) : routeForRef(gitlab)
  const github = parseGithubUrl(text)
  if (!github)
    return undefined
  return github.kind === 'github-repo' ? repositoryRoute(github) : routeForRef(github)
}
