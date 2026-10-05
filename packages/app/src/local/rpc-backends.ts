import type { Credentials, DiffSource } from '@pulls.review/core/types'
import type { Driver } from 'unstorage'
import type { LocalRpc } from './connection'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import { DiffsPayloadSchema } from '@pulls.review/core/types'
import * as v from 'valibot'

/** The server's cache directory as an unstorage driver: the browser's `CacheRepositories` run on it unchanged. */
export function createRpcDriver(rpc: LocalRpc): Driver {
  return {
    name: 'pulls-review-rpc',
    hasItem: async key => v.parse(v.nullable(v.string()), await rpc.call(LOCAL_RPC.storageGetItem, { key })) !== null,
    getItem: async key => v.parse(v.nullable(v.string()), await rpc.call(LOCAL_RPC.storageGetItem, { key })),
    setItem: async (key, value) => {
      await rpc.call(LOCAL_RPC.storageSetItem, { key, value })
    },
    removeItem: async (key) => {
      await rpc.call(LOCAL_RPC.storageRemoveItem, { key })
    },
    getKeys: async base => v.parse(v.array(v.string()), await rpc.call(LOCAL_RPC.storageGetKeys, { base })),
  }
}

/** The GitHub token the server found (environment or `gh`), read once per page load. */
export function createRpcCredentials(rpc: LocalRpc, fallback: Credentials): Credentials {
  let token: Promise<string | undefined> | undefined
  return {
    async githubToken() {
      token ??= rpc.call(LOCAL_RPC.githubToken).then(value => v.parse(v.optional(v.string()), value ?? undefined))
      return await token ?? fallback.githubToken()
    },
  }
}

/** A local diff, run by the server's `git`. */
export function createRpcSource(rpc: LocalRpc, target: string): DiffSource {
  return {
    key: async () => v.parse(v.string(), await rpc.call(LOCAL_RPC.sourceKey, { target })),
    fetch: async () => v.parse(DiffsPayloadSchema, await rpc.call(LOCAL_RPC.sourceFetch, { target })),
    fingerprint: async () => v.parse(v.string(), await rpc.call(LOCAL_RPC.sourceFingerprint, { target })),
    loadFile: async (path, sha) => v.parse(v.optional(v.string()), await rpc.call(LOCAL_RPC.sourceLoadFile, { target, path, sha }) ?? undefined),
  }
}
