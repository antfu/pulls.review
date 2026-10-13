import type { GithubLocation } from '@pulls.review/core/github'
import { parseGithubUrl } from '@pulls.review/core/github'
import { isLocalBranch, parseTarget, readCurrentBranch, resolveDefaultBranch } from '@pulls.review/core/local'

/** The site's `/gh/...` routes, which the `PR_LOCAL` build serves too. */
function githubPage(location: GithubLocation): string {
  const repo = `/gh/${location.owner}/${location.repo}`
  switch (location.kind) {
    case 'github-pr':
      return `${repo}/${location.number}`
    case 'github-compare':
      return `${repo}/compare/${location.base}...${location.head}`
    case 'github-commit':
      return `${repo}/commit/${location.sha}`
    case 'github-repo':
      return repo
  }
}

/** The page an argument opens (see the app's local routes). */
export async function pageFor(cwd: string, arg: string | undefined, worktree: boolean): Promise<string> {
  if (worktree)
    return '/worktree'
  if (!arg) {
    const [current, defaultBranch] = await Promise.all([readCurrentBranch(cwd), resolveDefaultBranch(cwd)])
    return current && defaultBranch && current !== defaultBranch.name ? `/branch/${current}` : '/'
  }
  const github = parseGithubUrl(arg)
  if (github)
    return githubPage(github)
  // Fails on a malformed target here, before a browser opens onto an error.
  const target = parseTarget(arg)
  if (target.kind === 'range')
    return `/compare/${arg}`
  return await isLocalBranch(cwd, arg) ? `/branch/${arg}` : `/commit/${arg}`
}

/** Encode a page path without treating a valid `#` in a git ref as a URL fragment. */
export function browserPath(page: string): string {
  return encodeURI(page).replaceAll('#', '%23')
}

/**
 * The site's `?from=<login>` deep link for `--from`: the pull request page loads that user's
 * shared analysis on every open, so a cached copy never hides a newer one. Only a pull request
 * carries shared analyses, so any other target is rejected before a browser opens.
 */
export function sharedAnalysisQuery(arg: string | undefined, from: string | undefined): string {
  if (from === undefined)
    return ''
  if (!from)
    throw new Error('--from needs a GitHub login.')
  if (!arg || parseGithubUrl(arg)?.kind !== 'github-pr')
    throw new Error('--from only applies to a GitHub pull request (owner/repo#123 or its github.com URL).')
  return `?${new URLSearchParams({ from })}`
}
