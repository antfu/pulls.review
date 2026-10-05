/**
 * The contract between the `pulls.review` devframe server (`packages/cli`) and the
 * `PR_LOCAL` app build: the devframe id, where it mounts, and its RPC function names.
 * Browser-safe; both sides import it so the names can't drift.
 */
export const LOCAL_DEVFRAME_ID = 'pulls.review'

/** Where a devframe hub mounts it (`/__<id>/`); standalone, it serves at `/`. */
export const LOCAL_HUB_BASE_PATH = '/__pulls.review/'

/** Bare names; devframe namespaces them as `pulls.review:<name>`. */
export const LOCAL_RPC = {
  /** Branches, tags, recent commits and the default branch, for the ref picker. */
  repoInfo: 'repo-info',
  sourceKey: 'source-key',
  sourceFetch: 'source-fetch',
  sourceFingerprint: 'source-fingerprint',
  sourceLoadFile: 'source-load-file',
  /** An unstorage driver over the server's cache directory. */
  storageGetItem: 'storage-get-item',
  storageSetItem: 'storage-set-item',
  storageRemoveItem: 'storage-remove-item',
  storageGetKeys: 'storage-get-keys',
  githubToken: 'github-token',
} as const
