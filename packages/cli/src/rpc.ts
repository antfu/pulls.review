import type { Env } from '@pulls.review/core/env'
import type { Driver } from 'unstorage'
import { createLocalSource, readRepoInfo } from '@pulls.review/core/local'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import { DiffsPayloadSchema } from '@pulls.review/core/types'
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { resolveGithubToken } from './credentials'

export interface LocalRpcOptions {
  /** Any directory inside the repository under review. */
  cwd: string
  /** Where the browser's cache lives (see `createRepoCacheDriver`). */
  driver: Driver
  env: Env
  /** From `--github-token`: wins over `env` and `gh auth token`. */
  githubToken?: string
}

const target = v.object({ target: v.string() })

/**
 * Every function the `PR_LOCAL` SPA calls. Only a client devframe has trusted
 * reaches them; inputs are still validated, since they decide what `git` runs.
 */
export function localRpcFunctions({ cwd, driver, env, githubToken }: LocalRpcOptions) {
  const source = (text: string) => createLocalSource({ cwd, target: text })
  return [
    defineRpcFunction({ name: LOCAL_RPC.repoInfo, type: 'query', handler: () => readRepoInfo(cwd) }),
    defineRpcFunction({ name: LOCAL_RPC.sourceKey, type: 'query', args: [target], returns: v.string(), handler: ({ target }) => source(target).key() }),
    defineRpcFunction({ name: LOCAL_RPC.sourceFetch, type: 'query', args: [target], returns: DiffsPayloadSchema, handler: ({ target }) => source(target).fetch() }),
    defineRpcFunction({ name: LOCAL_RPC.sourceFingerprint, type: 'query', args: [target], returns: v.string(), handler: ({ target }) => source(target).fingerprint() }),
    defineRpcFunction({
      name: LOCAL_RPC.sourceLoadFile,
      type: 'query',
      args: [v.object({ target: v.string(), path: v.string(), sha: v.string() })],
      returns: v.optional(v.string()),
      handler: ({ target, path, sha }) => source(target).loadFile(path, sha),
    }),
    defineRpcFunction({
      name: LOCAL_RPC.storageGetItem,
      type: 'query',
      args: [v.object({ key: v.string() })],
      returns: v.nullable(v.string()),
      handler: async ({ key }) => {
        const value = await driver.getItem(key, {})
        return typeof value === 'string' ? value : null
      },
    }),
    defineRpcFunction({
      name: LOCAL_RPC.storageSetItem,
      type: 'action',
      args: [v.object({ key: v.string(), value: v.string() })],
      returns: v.void(),
      handler: async ({ key, value }) => {
        await driver.setItem?.(key, value, {})
      },
    }),
    defineRpcFunction({
      name: LOCAL_RPC.storageRemoveItem,
      type: 'action',
      args: [v.object({ key: v.string() })],
      returns: v.void(),
      handler: async ({ key }) => {
        await driver.removeItem?.(key, {})
      },
    }),
    defineRpcFunction({
      name: LOCAL_RPC.storageGetKeys,
      type: 'query',
      args: [v.object({ base: v.string() })],
      returns: v.array(v.string()),
      handler: ({ base }) => driver.getKeys(base, {}),
    }),
    defineRpcFunction({ name: LOCAL_RPC.githubToken, type: 'query', handler: () => resolveGithubToken(env, githubToken) }),
  ]
}
