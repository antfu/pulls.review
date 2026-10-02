import type { Storage } from 'unstorage'

const FILE_CONTENT_KEY_PREFIX = 'file-content:'

export interface FileContentCache {
  /** `scope` is the diff's cache key, so a sha that isn't a commit (a local working tree) can't collide across sources. */
  get: (scope: string, sha: string, path: string) => Promise<string | undefined>
  set: (scope: string, sha: string, path: string, content: string) => Promise<void>
}

/**
 * Keyed by (diff, ref sha, path) - `sha` here is the diff's base/head **commit** sha
 * (already on `DiffsPayload.base`/`head`, no extra request needed to look up a
 * per-blob sha), which is just as content-addressed as a blob sha for caching
 * purposes: the same commit + path always yields the same bytes.
 */
function fileContentKey(scope: string, sha: string, path: string): string {
  return `${FILE_CONTENT_KEY_PREFIX}${scope}:${sha}:${path}`
}

export function createFileContentCache(storage: Storage): FileContentCache {
  return {
    async get(scope, sha, path) {
      const value = await storage.getItem(fileContentKey(scope, sha, path))
      // A corrupt/previous-shape entry is treated as a cache miss rather than throwing.
      return typeof value === 'string' ? value : undefined
    },
    async set(scope, sha, path, content) {
      await storage.setItem(fileContentKey(scope, sha, path), content)
    },
  }
}
