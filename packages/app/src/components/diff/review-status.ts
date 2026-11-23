import type { FileChange } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import { fileReviewKey } from '@pulls.review/core/types'

/** `changed`: reviewed at an earlier sha that later commits replaced, not yet re-marked. */
export type ReviewStatus = 'reviewed' | 'changed' | 'unreviewed'

export function reviewStatus(store: Pick<DiffsStore, 'reviewed' | 'changedSinceReviewed'>, file: FileChange): ReviewStatus {
  if (store.reviewed.has(fileReviewKey(file)))
    return 'reviewed'
  return store.changedSinceReviewed.has(file.path) ? 'changed' : 'unreviewed'
}
