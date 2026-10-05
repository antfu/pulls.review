import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Big enough for any diff a reviewer would open; `execFile` rejects past it rather than truncating. */
const MAX_BUFFER = 512 * 1024 * 1024

export interface GitOptions {
  /** Extra environment, e.g. `GIT_INDEX_FILE` for a throwaway index. */
  env?: Record<string, string>
}

/** Runs `git` without a shell; output in the C locale so it parses the same everywhere. */
export async function git(cwd: string, args: string[], options: GitOptions = {}): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, LC_ALL: 'C', GIT_PAGER: 'cat', ...options.env },
  })
  return stdout
}

/** Like `git`, but `undefined` instead of throwing when git exits non-zero (a probe). */
export async function tryGit(cwd: string, args: string[], options?: GitOptions): Promise<string | undefined> {
  try {
    return await git(cwd, args, options)
  }
  catch {
    return undefined
  }
}
