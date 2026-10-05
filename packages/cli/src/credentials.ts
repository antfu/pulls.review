import type { Env } from '@pulls.review/core/env'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { githubTokenFromEnv } from '@pulls.review/core/env'

/** The environment first, then the GitHub CLI's login, if `gh` is installed and signed in. */
export async function resolveGithubToken(env: Env): Promise<string | undefined> {
  const fromEnv = githubTokenFromEnv(env)
  if (fromEnv)
    return fromEnv
  try {
    const { stdout } = await promisify(execFile)('gh', ['auth', 'token'])
    return stdout.trim() || undefined
  }
  catch {
    return undefined
  }
}
