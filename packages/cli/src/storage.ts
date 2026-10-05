import type { Driver } from 'unstorage'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import fsDriver from 'unstorage/drivers/fs'

/**
 * The fs driver maps every `:` of a key to a directory, so `a:b` (a file) and `a:b:c`
 * (needing `a/b/` as a directory) can't both exist. Keys stay one directory per
 * collection prefix (`pr-meta:`, `review:`, ...) with the rest escaped into one file name.
 */
export function flatKeys(driver: Driver): Driver {
  const encode = (key: string) => {
    const [head = '', ...rest] = key.split(':')
    return rest.length ? `${head}:${encodeURIComponent(rest.join(':'))}` : head
  }
  // The fs driver lists keys as paths (`pr-meta/<file>`).
  const decode = (key: string) => {
    const [head = '', ...rest] = key.split(/[:/]/)
    return rest.length ? `${head}:${decodeURIComponent(rest.join(':'))}` : head
  }
  return {
    ...driver,
    hasItem: (key, opts) => driver.hasItem(encode(key), opts),
    getItem: (key, opts) => driver.getItem(encode(key), opts),
    setItem: (key, value, opts) => driver.setItem?.(encode(key), value, opts),
    removeItem: (key, opts) => driver.removeItem?.(encode(key), opts),
    getKeys: async (base, opts) => (await driver.getKeys(encode(base.replace(/:$/, '')), opts)).map(decode),
  }
}

/** `<git-common-dir>/pulls-review`: shared by every worktree of the repo, never committed. */
export async function repoCacheDir(cwd: string): Promise<string> {
  const { stdout } = await promisify(execFile)('git', ['rev-parse', '--git-common-dir'], { cwd })
  return resolve(cwd, stdout.trim(), 'pulls-review')
}

export async function createRepoCacheDriver(cwd: string): Promise<Driver> {
  return flatKeys(fsDriver({ base: await repoCacheDir(cwd) }))
}
