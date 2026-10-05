import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localRpcFunctions } from './rpc'

let repo: string

function call(functions: ReturnType<typeof localRpcFunctions>, name: string, ...args: unknown[]) {
  const fn = functions.find(candidate => candidate.name === name)
  // The handlers take the validated argument shapes; the test passes them as the browser would.
  return (fn!.handler as (...input: unknown[]) => Promise<unknown>)(...args)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pulls-review-rpc-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  writeFileSync(join(repo, 'a.ts'), 'one\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  writeFileSync(join(repo, 'a.ts'), 'two\n')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('local RPC', () => {
  it('serves the diff and a browser-side cache that runs over the storage functions', async () => {
    const functions = localRpcFunctions({ cwd: repo, driver: memoryDriver(), env: { GITHUB_TOKEN: 'from-env' } })

    expect(await call(functions, LOCAL_RPC.repoInfo)).toMatchObject({ currentBranch: 'main', defaultBranch: { name: 'main', ref: 'main' }, branches: ['main'], commits: [{ subject: 'init' }] })
    expect(await call(functions, LOCAL_RPC.githubToken)).toBe('from-env')
    const diff = await call(functions, LOCAL_RPC.sourceFetch, { target: '' }) as { files: { path: string }[], head: { sha: string } }
    expect(diff.files.map(file => file.path)).toEqual(['a.ts'])
    expect(await call(functions, LOCAL_RPC.sourceFingerprint, { target: '' })).toBe(diff.head.sha)
    expect(await call(functions, LOCAL_RPC.sourceLoadFile, { target: '', path: 'a.ts', sha: diff.head.sha })).toBe('two\n')

    // The browser's repositories over an unstorage driver made of these functions.
    const cache = createCacheRepositories(createStorage({
      driver: {
        getItem: key => call(functions, LOCAL_RPC.storageGetItem, { key }),
        hasItem: async key => await call(functions, LOCAL_RPC.storageGetItem, { key }) !== null,
        setItem: async (key, value) => void await call(functions, LOCAL_RPC.storageSetItem, { key, value }),
        removeItem: async key => void await call(functions, LOCAL_RPC.storageRemoveItem, { key }),
        getKeys: base => call(functions, LOCAL_RPC.storageGetKeys, { base }) as Promise<string[]>,
      },
    }))
    await cache.reviewMarks.set(['sha-a'], true)
    expect(await cache.reviewMarks.get(['sha-a', 'sha-b'])).toEqual(new Set(['sha-a']))
  })
})
