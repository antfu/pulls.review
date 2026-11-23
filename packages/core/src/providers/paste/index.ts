import type { FileChange } from '../../types/diff'
import type { DiffSource } from '../../types/source'
import { computeContentHash, parsePatch } from '../../patch-parser'
import { fileReviewKey } from '../../types/diff'
import { serializeRef } from '../../types/source'

const CACHE_VERSION = 1

// Compare what was available for review. Raw chunk hashes can change when a boundary
// moves, and a Git blob SHA can stay the same even though the old hunk was incomplete.
function reviewContent(file: FileChange): string {
  return JSON.stringify([file.path, file.previousPath, file.status, file.additions, file.deletions, file.isBinary, file.truncated, file.hunks])
}

function restoreReviewKeys(files: FileChange[], previous: FileChange[], hash: string): FileChange[] {
  const prior = new Map(previous.map(file => [reviewContent(file), fileReviewKey(file)]))
  return files.map((file, index) => {
    const key = prior.get(reviewContent(file)) ?? `paste:${hash}:v${CACHE_VERSION}:${index}`
    return key === file.sha ? file : { ...file, reviewKey: key }
  })
}

/** A pasted or uploaded patch: no live source, so no staleness check. */
export function createPasteSource(text: string, title?: string): DiffSource {
  const hash = computeContentHash(text)
  return {
    key: async () => serializeRef({ kind: 'paste', hash: await hash }),
    cacheVersion: CACHE_VERSION,
    async fetch(previous) {
      const contentHash = await hash
      const cached = previous?.ref.kind === 'paste' && previous.ref.hash === contentHash ? previous : undefined
      // Identical bytes at the current parser version have identical files. Reuse
      // their review keys on explicit refresh as well as on an ordinary cache hit.
      let files: FileChange[]
      if (cached?.cacheVersion === CACHE_VERSION) {
        files = cached.files
      }
      else {
        files = await parsePatch(text)
        if (cached)
          files = restoreReviewKeys(files, cached.files, contentHash)
      }
      return {
        cacheVersion: CACHE_VERSION,
        ref: { kind: 'paste', hash: contentHash },
        title: title ?? 'Pasted diff',
        description: '',
        files,
      }
    },
  }
}
