import { isLocalBranch, parseTarget, readCurrentBranch, resolveDefaultBranch } from '@pulls.review/core/local'

/** The page an argument opens (see the app's local routes). */
export async function pageFor(cwd: string, arg: string | undefined, worktree: boolean): Promise<string> {
  if (worktree)
    return '/worktree'
  if (!arg) {
    const [current, defaultBranch] = await Promise.all([readCurrentBranch(cwd), resolveDefaultBranch(cwd)])
    return current && defaultBranch && current !== defaultBranch.name ? `/branch/${current}` : '/'
  }
  // Fails on a malformed target here, before a browser opens onto an error.
  const target = parseTarget(arg)
  if (target.kind === 'range')
    return `/compare/${arg}`
  return await isLocalBranch(cwd, arg) ? `/branch/${arg}` : `/commit/${arg}`
}
