import type { Storage } from 'unstorage'

const FILE_CONTENT_KEY_PREFIX = 'file-content:'

export interface FileContentCache {
  get: (path: string, sha: string) => Promise<string | undefined>
  set: (path: string, sha: string, content: string) => Promise<void>
}

/**
 * Keyed by (ref sha, path) - `sha` here is the PR's base/head **commit** sha (already
 * on `DiffsPayload.base`/`head`, no extra request needed to look up a per-blob sha),
 * which is just as content-addressed as a blob sha for caching purposes: the same
 * commit + path always yields the same bytes.
 */
function fileContentKey(path: string, sha: string): string {
  return `${FILE_CONTENT_KEY_PREFIX}${sha}:${path}`
}

export function createFileContentCache(storage: Storage): FileContentCache {
  return {
    async get(path, sha) {
      const value = await storage.getItem(fileContentKey(path, sha))
      // A corrupt/previous-shape entry is treated as a cache miss rather than throwing.
      return typeof value === 'string' ? value : undefined
    },
    async set(path, sha, content) {
      await storage.setItem(fileContentKey(path, sha), content)
    },
  }
}
