import type { FileReviewState } from '../types/review'
import type { CacheStorage } from './storage'
import * as v from 'valibot'
import { FileReviewStateSchema } from '../types/review'

const REVIEW_KEY_PREFIX = 'review:'

function reviewKey(sha: string): string {
  return `${REVIEW_KEY_PREFIX}${sha}`
}

export async function getReviewed(storage: CacheStorage, shas: string[]): Promise<Set<string>> {
  if (shas.length === 0)
    return new Set()
  const items = await storage.getItems(shas.map(reviewKey))
  const reviewed = new Set<string>()
  for (const { value } of items) {
    const result = v.safeParse(FileReviewStateSchema, value)
    // A corrupt or previous-shape entry is treated as not-reviewed rather than throwing.
    if (result.success)
      reviewed.add(result.output.sha)
  }
  return reviewed
}

export async function setReviewed(storage: CacheStorage, shas: string[], reviewed: boolean): Promise<void> {
  const reviewedAt = Date.now()
  await Promise.all(shas.map(sha => reviewed
    ? storage.setItem(reviewKey(sha), { sha, reviewedAt } satisfies FileReviewState)
    : storage.removeItem(reviewKey(sha))))
}

/**
 * Review state is content-addressed and not tied 1:1 to a single `pr-cache`
 * row, so pruning walks all remaining `pr-cache` entries (not just the
 * just-evicted one) to build the live sha set, passed in by the caller,
 * since only `pr-cache.ts` knows what's left after eviction.
 */
export async function pruneOrphanedReviewed(storage: CacheStorage, remainingShas: Set<string>): Promise<void> {
  const keys = await storage.getKeys(REVIEW_KEY_PREFIX)
  const orphaned = keys.filter(key => !remainingShas.has(key.slice(REVIEW_KEY_PREFIX.length)))
  await Promise.all(orphaned.map(key => storage.removeItem(key)))
}
