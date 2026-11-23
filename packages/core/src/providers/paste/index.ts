import type { FileChange } from '../../types/diff'
import type { DiffSource } from '../../types/source'
import { computeContentHash, parsePatch } from '../../patch-parser'
import { repeatedFilePaths } from '../../review-paths'
import { fileReviewKey } from '../../types/diff'
import { serializeRef } from '../../types/source'

const CACHE_VERSION = 1

// Compare what was available for review. Raw chunk hashes can change when a boundary
// moves, and a Git blob SHA can stay the same even though the old hunk was incomplete.
function reviewContent(file: FileChange): string {
  return JSON.stringify([file.path, file.previousPath, file.status, file.additions, file.deletions, file.isBinary, file.truncated, file.hunks])
}

function restoreReviewKeys(files: FileChange[], previous: FileChange[], scope: string): FileChange[] {
  const repeated = repeatedFilePaths(previous, files)
  const prior = new Map<string, FileChange[]>()
  for (const file of previous) {
    const content = reviewContent(file)
    const matches = prior.get(content)
    if (matches)
      matches.push(file)
    else
      prior.set(content, [file])
  }
  return files.map((file, index) => {
    // A corrected hunk can now look exactly like another occurrence, including
    // its blob. Keep the key the parser assigned to this occurrence.
    if (file.reviewKey && repeated.has(file.path))
      return file
    const matches = prior.get(reviewContent(file))
    // A patch series can show the same hunk for different blobs at one path.
    const match = matches?.find(old => old.sha === file.sha) ?? (repeated.has(file.path) ? undefined : matches?.[0])
    const key = match ? fileReviewKey(match) : `${scope}:${index}`
    return key === fileReviewKey(file) ? file : { ...file, reviewKey: key }
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
        // Derive isolated keys from the input even after eviction. A cached
        // file with identical review content can carry its original mark forward.
        const scope = `paste:${contentHash}:v${CACHE_VERSION}`
        files = await parsePatch(text, scope)
        if (cached)
          files = restoreReviewKeys(files, cached.files, scope)
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
