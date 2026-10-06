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
