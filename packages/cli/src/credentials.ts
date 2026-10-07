import type { Env } from '@pulls.review/core/env'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { githubTokenFromEnv } from '@pulls.review/core/env'

/** The `--github-token` flag, then the environment, then the GitHub CLI's login, if `gh` is installed and signed in. */
export async function resolveGithubToken(env: Env, flag?: string): Promise<string | undefined> {
  const given = flag || githubTokenFromEnv(env)
  if (given)
    return given
  try {
    const { stdout } = await promisify(execFile)('gh', ['auth', 'token'])
    return stdout.trim() || undefined
  }
  catch {
    return undefined
  }
}
