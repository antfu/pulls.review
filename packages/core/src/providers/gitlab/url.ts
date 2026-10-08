import type { SourceRef } from '../../types/source'

/** The instance assumed when none is named; a ref always carries its host, so two instances never share a key. */
export const GITLAB_COM = 'gitlab.com'

/** What a GitLab URL points at: a merge request the app can open, or a project (its merge request list). */
export type GitlabLocation
  = | Extract<SourceRef, { kind: 'gitlab-mr' }>
    | { kind: 'gitlab-project', host: string, project: string }

const SHORTHAND_RE = /^([\w.-]+(?:\/[\w.-]+)+)!(\d+)$/

/**
 * GitLab separates a project's path from its own pages with `/-/`, so namespaces nest
 * to any depth. The path matches lazily: `-` is a legal path character, and a greedy
 * match would take `/-/merge_requests/1` for three more namespaces.
 */
function urlPattern(host: string): RegExp {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^(?:https?://)?${escaped}/([\\w.-]+(?:/[\\w.-]+)+?)(?:/-/([^\\s?#]*))?/?(?:[?#]|$)`)
}

/**
 * A pasted URL on `host` (a merge request, a project or one of its pages), or the
 * `group/project!123` shorthand for a merge request there. A URL on any other host
 * is not read.
 */
export function parseGitlabUrl(text: string, host = GITLAB_COM): GitlabLocation | undefined {
  const shorthand = SHORTHAND_RE.exec(text.trim())
  if (shorthand)
    return { kind: 'gitlab-mr', host, project: shorthand[1]!, iid: shorthand[2]! }

  const match = urlPattern(host).exec(text.trim())
  if (!match)
    return undefined
  const [, project = '', page = ''] = match
  const iid = /^merge_requests\/(\d+)/.exec(page)?.[1]
  return iid
    ? { kind: 'gitlab-mr', host, project, iid }
    : { kind: 'gitlab-project', host, project }
}
