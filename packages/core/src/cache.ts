/** Persistence as repositories over any unstorage `Storage` (IndexedDB, memory, fs, ...). */
import type { Storage } from 'unstorage'
import type { CacheBudget, DiffCache } from './cache/diff-cache'
import type { FileContentCache } from './cache/file-content-cache'
import type { PullRequestListCache } from './cache/pull-request-list-cache'
import type { ReviewMarks } from './cache/review-marks'
import { createDiffCache } from './cache/diff-cache'
import { createFileContentCache } from './cache/file-content-cache'
import { createPullRequestListCache } from './cache/pull-request-list-cache'
import { createReviewMarks } from './cache/review-marks'

export * from './cache/diff-cache'
export * from './cache/file-content-cache'
export * from './cache/pull-request-list-cache'
export * from './cache/review-marks'
export * from './cache/schema'

export interface CacheRepositories {
  diffs: DiffCache
  reviewMarks: ReviewMarks
  fileContents: FileContentCache
  pullRequestLists: PullRequestListCache
}

/** Every collection shares one storage by key prefix (`pr-meta:*`, `review:*`, ...). */
export function createCacheRepositories(storage: Storage, budget?: CacheBudget): CacheRepositories {
  const reviewMarks = createReviewMarks(storage)
  return {
    diffs: createDiffCache(storage, reviewMarks, budget),
    reviewMarks,
    fileContents: createFileContentCache(storage),
    pullRequestLists: createPullRequestListCache(storage),
  }
}
