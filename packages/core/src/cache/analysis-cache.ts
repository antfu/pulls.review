import type { Storage } from 'unstorage'
import type { GroupedResult } from '../types/analyze'
import type { DiffsPayload } from '../types/diff'
import * as v from 'valibot'
import { GroupedResultSchema } from '../types/analyze'

const PREFIX = 'analysis:'
export const DEFAULT_MAX_ANALYSES = 50

const RecordSchema = v.object({ savedAt: v.number(), result: GroupedResultSchema })

/** The identity of a diff (`base...head`), so an analysis can be keyed by it and reused from any ref. */

/**
 * A model call's result, remembered for the commits it analyzed rather than for the
 * URL that named them. A pull request and the compare range of its own branches
 * resolve to the same `base...head` (`fetchPullRequest` and `fetchCompare` both use
 * the merge base), so analyzing either one answers the other: the reviewer keeps the
 * reading they already had, and nothing is paid for twice.
 */
export interface AnalysisCache {
  get: (identity: string) => Promise<GroupedResult | undefined>
  set: (identity: string, result: GroupedResult) => Promise<void>
}

/**
 * `undefined` when the diff has no commits to name it by (a paste), which keeps an
 * analysis from ever being reused for content it did not see. The working tree's
 * `head.sha` is already a hash of its own patch (`local/source.ts`), so a
 * content-addressed identity covers local targets too.
 */
export function analysisIdentity(diff: Pick<DiffsPayload, 'base' | 'head'>): string | undefined {
  const base = diff.base?.sha
  const head = diff.head?.sha
  return base && head ? `${base}...${head}` : undefined
}

/**
 * Results that outlive the diff entry they were produced for, so the same change can
 * be reviewed once and read again wherever it is opened. Bounded by entry count and
 * evicted oldest-first: a result is worth keeping, not worth hoarding.
 */
export function createAnalysisCache(storage: Storage, maxEntries = DEFAULT_MAX_ANALYSES): AnalysisCache {
  const storageKey = (identity: string) => `${PREFIX}${identity}`

  async function evict() {
    const keys = await storage.getKeys(PREFIX)
    if (keys.length <= maxEntries)
      return
    const items = await storage.getItems(keys)
    const saved = items.map(({ key, value }) => {
      const parsed = v.safeParse(RecordSchema, value)
      // Unreadable entries sort first, so they are dropped before anything usable.
      return { key, savedAt: parsed.success ? parsed.output.savedAt : 0 }
    })
    saved.sort((a, b) => a.savedAt - b.savedAt)
    await Promise.all(saved.slice(0, saved.length - maxEntries).map(entry => storage.removeItem(entry.key)))
  }

  return {
    async get(identity) {
      const parsed = v.safeParse(RecordSchema, await storage.getItem(storageKey(identity)))
      return parsed.success ? parsed.output.result : undefined
    },
    async set(identity, result) {
      await storage.setItem(storageKey(identity), { savedAt: Date.now(), result })
      await evict()
    },
  }
}
