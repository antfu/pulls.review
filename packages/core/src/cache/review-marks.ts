import type { Storage } from 'unstorage'
import type { FileReviewState } from './schema'
import * as v from 'valibot'
import { FileReviewStateSchema } from './schema'

const REVIEW_KEY_PREFIX = 'review:'

function reviewKey(sha: string): string {
  return `${REVIEW_KEY_PREFIX}${sha}`
}

export interface ReviewMarks {
  get: (shas: string[]) => Promise<Set<string>>
  set: (shas: string[], reviewed: boolean) => Promise<void>
  /** Drops every mark whose sha no cached diff references any more. */
  prune: (remainingShas: Set<string>) => Promise<void>
}

export function createReviewMarks(storage: Storage): ReviewMarks {
  return {
    async get(shas) {
      if (shas.length === 0)
        return new Set()
      const reviewed = new Set<string>()
      for (const { value } of await storage.getItems(shas.map(reviewKey))) {
        const result = v.safeParse(FileReviewStateSchema, value)
        // A corrupt or previous-shape entry is treated as not-reviewed rather than throwing.
        if (result.success)
          reviewed.add(result.output.sha)
      }
      return reviewed
    },
    async set(shas, reviewed) {
      const reviewedAt = Date.now()
      await Promise.all(shas.map(sha => reviewed
        ? storage.setItem(reviewKey(sha), { sha, reviewedAt } satisfies FileReviewState)
        : storage.removeItem(reviewKey(sha))))
    },
    async prune(remainingShas) {
      const keys = await storage.getKeys(REVIEW_KEY_PREFIX)
      const orphaned = keys.filter(key => !remainingShas.has(key.slice(REVIEW_KEY_PREFIX.length)))
      await Promise.all(orphaned.map(key => storage.removeItem(key)))
    },
  }
}
