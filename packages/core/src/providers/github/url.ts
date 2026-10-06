import type { SourceRef } from '../../types/source'

/** What a github.com URL points at: a diff the app can open, or a repo (its PR list). */
export type GithubLocation
  = | Extract<SourceRef, { kind: 'github-pr' | 'github-compare' | 'github-commit' }>
    | { kind: 'github-repo', owner: string, repo: string }

/** `base...head` into its two sides; `undefined` without the three dots. */
export function splitRange(range: string): { base: string, head: string } | undefined {
  const dots = range.indexOf('...')
  return dots > 0 && dots + 3 < range.length ? { base: range.slice(0, dots), head: range.slice(dots + 3) } : undefined
}

/**
 * A pasted github.com URL (a PR, compare or commit page, a bare repo or its `/pulls`),
 * or the `owner/repo#123` shorthand for a pull request.
 */
export function parseGithubUrl(text: string): GithubLocation | undefined {
  const shorthand = text.trim().match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/)
  if (shorthand)
    return { kind: 'github-pr', owner: shorthand[1]!, repo: shorthand[2]!, number: shorthand[3]! }

  const match = text.trim().match(/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/(pull|commit|compare)\/([^\s#?]+)|\/pulls\/?)?(?:[/?#]|$)/)
  if (!match)
    return undefined
  const [, owner = '', repo = '', kind, rest = ''] = match
  if (kind === 'pull') {
    const number = rest.match(/^\d+/)?.[0]
    return number ? { kind: 'github-pr', owner, repo, number } : undefined
  }
  if (kind === 'commit')
    return { kind: 'github-commit', owner, repo, sha: rest.replace(/\/.*$/, '') }
  if (kind === 'compare') {
    const range = splitRange(rest)
    return range && { kind: 'github-compare', owner, repo, ...range }
  }
  return { kind: 'github-repo', owner, repo }
}
