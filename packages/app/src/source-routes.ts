import type { SourceRef } from '@pulls.review/core/types'

/**
 * The one place that maps diff refs to app routes and back. Components link through
 * these helpers instead of spelling out `/gh/...` paths.
 */
/** Every ref kind with a page of its own. */
export type RoutableRef = Exclude<SourceRef, { kind: 'paste' }>

export function routeForRef(ref: RoutableRef): string
export function routeForRef(ref: SourceRef): string | undefined
export function routeForRef(ref: SourceRef): string | undefined {
  switch (ref.kind) {
    case 'github-pr':
      return `/gh/${ref.owner}/${ref.repo}/${ref.number}`
    case 'paste':
      // Deliberately unroutable: a paste has no live source to reopen from a link.
      return undefined
  }
}

export function repoRoute(owner: string, repo: string): string {
  return `/gh/${owner}/${repo}`
}

/** Where a diff sits, e.g. its repo's PR list - `undefined` for a ref with no parent view. */
export function parentForRef(ref: SourceRef): { route: string, label: string } | undefined {
  return ref.kind === 'github-pr'
    ? { route: repoRoute(ref.owner, ref.repo), label: `${ref.owner}/${ref.repo}` }
    : undefined
}

export function pullRequestRefFromRoute(params: Record<string, string | string[]>): Extract<SourceRef, { kind: 'github-pr' }> {
  const param = (name: string) => String(params[name])
  return { kind: 'github-pr', owner: param('owner'), repo: param('repo'), number: param('number') }
}

/** A pasted github.com URL as an app route: a PR opens its diff, a bare repo (or its `/pulls`) the PR list. */
export function routeFromGithubUrl(text: string): string | undefined {
  const match = text.trim().match(/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/pull\/(\d+)|\/pulls\/?)?(?:[/?#]|$)/)
  if (!match)
    return undefined
  const [, owner = '', repo = '', number] = match
  return number ? routeForRef({ kind: 'github-pr', owner, repo, number }) : repoRoute(owner, repo)
}
