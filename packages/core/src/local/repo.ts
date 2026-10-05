import { tryGit } from './git'

export interface RepoInfo {
  /** `undefined` on a detached HEAD. */
  currentBranch?: string
  /** What a branch is reviewed against, like the PR it would become (see `resolveDefaultBranch`). */
  defaultBranch?: { name: string, ref: string }
  branches: string[]
  tags: string[]
  /** The latest commits on HEAD, newest first. */
  commits: { sha: string, subject: string }[]
}

async function lines(cwd: string, args: string[]): Promise<string[]> {
  return ((await tryGit(cwd, args)) ?? '').split('\n').map(line => line.trim()).filter(Boolean)
}

/**
 * `origin/HEAD`'s branch when set, else `main`, else `master`. Compared through
 * `origin/<name>` when it exists, since a local default branch is often stale.
 */
export async function resolveDefaultBranch(cwd: string): Promise<RepoInfo['defaultBranch']> {
  const originHead = (await tryGit(cwd, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']))?.trim()
  const candidates = originHead ? [originHead.replace(/^origin\//, '')] : ['main', 'master']
  for (const name of candidates) {
    for (const ref of [`origin/${name}`, name]) {
      if (await tryGit(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]))
        return { name, ref }
    }
  }
  return undefined
}

/** `undefined` on a detached HEAD. */
export async function readCurrentBranch(cwd: string): Promise<string | undefined> {
  return (await tryGit(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']))?.trim() || undefined
}

export async function readRepoInfo(cwd: string, commitCount = 10): Promise<RepoInfo> {
  const [currentBranch, defaultBranch, branches, tags, log] = await Promise.all([
    readCurrentBranch(cwd),
    resolveDefaultBranch(cwd),
    lines(cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads']),
    lines(cwd, ['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)', 'refs/tags']),
    lines(cwd, ['log', `-${commitCount}`, '--format=%H%x00%s']),
  ])
  return {
    currentBranch,
    defaultBranch,
    branches,
    tags,
    commits: log.map((line) => {
      const [sha = '', subject = ''] = line.split('\0')
      return { sha, subject }
    }),
  }
}

/** Whether `name` is a local branch (and so opens as `/branch/<name>` rather than as a commit). */
export async function isLocalBranch(cwd: string, name: string): Promise<boolean> {
  return await tryGit(cwd, ['show-ref', '--verify', '-q', `refs/heads/${name}`]) !== undefined
}
