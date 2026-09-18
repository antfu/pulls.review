import type { GroupedResult } from '../types/analyze'
import type { LlmSession, PrCacheEntry } from '../types/cache'
import type { ReviewData } from '../types/comment-threads'
import type { CacheStorage } from './storage'
import * as v from 'valibot'
import { PrCacheEntrySchema } from '../types/cache'
import { pruneOrphanedReviewed } from './review-cache'

const PR_KEY_PREFIX = 'pr:'
export const DEFAULT_MAX_BUDGET_BYTES = 50 * 1024 * 1024
export const DEFAULT_MAX_ENTRY_COUNT = 50

export interface CacheBudget {
  maxBytes?: number
  maxEntries?: number
}

function prKey(key: string): string {
  return `${PR_KEY_PREFIX}${key}`
}

/** Rough approximation of an entry's on-disk footprint, used for LRU budget accounting. */
export function computeEntrySizeBytes(diff: PrCacheEntry['diff'], analyzedBy: PrCacheEntry['analyzedBy'], llmSession?: LlmSession): number {
  return new TextEncoder().encode(JSON.stringify({ diff, analyzedBy, llmSession })).length
}

export async function getEntry(storage: CacheStorage, key: string): Promise<PrCacheEntry | undefined> {
  const raw = await storage.getItem(prKey(key))
  if (raw == null)
    return undefined
  const result = v.safeParse(PrCacheEntrySchema, raw)
  // A corrupt or previous-shape entry (e.g. after a schemaVersion bump) is treated
  // as a cache miss instead of crashing the view layer.
  return result.success ? result.output : undefined
}

export async function putEntry(storage: CacheStorage, entry: PrCacheEntry, budget?: CacheBudget): Promise<void> {
  await storage.setItem(prKey(entry.key), entry)
  await enforceBudget(storage, budget)
}

export async function touchEntry(storage: CacheStorage, key: string): Promise<void> {
  const entry = await getEntry(storage, key)
  if (!entry)
    return
  await storage.setItem(prKey(key), { ...entry, lastViewedAt: Date.now() })
}

export async function setAnalyzedResult(storage: CacheStorage, key: string, source: GroupedResult['source'], result: GroupedResult): Promise<void> {
  const entry = await getEntry(storage, key)
  if (!entry)
    return
  await storage.setItem(prKey(key), { ...entry, analyzedBy: { ...entry.analyzedBy, [source]: result } })
}

export async function setLlmSession(storage: CacheStorage, key: string, session: LlmSession | undefined): Promise<void> {
  const entry = await getEntry(storage, key)
  if (!entry)
    return
  const next: PrCacheEntry = { ...entry, llmSession: session as PrCacheEntry['llmSession'] }
  if (session === undefined)
    delete next.llmSession
  next.sizeBytes = computeEntrySizeBytes(next.diff, next.analyzedBy, session)
  await storage.setItem(prKey(key), next)
  await enforceBudget(storage)
}

export async function setReviewData(storage: CacheStorage, key: string, reviews: ReviewData): Promise<void> {
  const entry = await getEntry(storage, key)
  if (!entry)
    return
  await storage.setItem(prKey(key), { ...entry, reviews })
}

async function getAllEntries(storage: CacheStorage): Promise<PrCacheEntry[]> {
  const keys = await storage.getKeys(PR_KEY_PREFIX)
  const raw = await storage.getItems(keys)
  const entries: PrCacheEntry[] = []
  for (const { value } of raw) {
    const result = v.safeParse(PrCacheEntrySchema, value)
    if (result.success)
      entries.push(result.output)
  }
  return entries
}

/** Most-recently-viewed entries first, for the home page's "recent" list. */
export async function listRecentEntries(storage: CacheStorage, limit: number): Promise<PrCacheEntry[]> {
  const entries = await getAllEntries(storage)
  return entries.sort((a, b) => b.lastViewedAt - a.lastViewedAt).slice(0, limit)
}

export async function enforceBudget(storage: CacheStorage, budget?: CacheBudget): Promise<void> {
  const maxBytes = budget?.maxBytes ?? DEFAULT_MAX_BUDGET_BYTES
  const maxEntries = budget?.maxEntries ?? DEFAULT_MAX_ENTRY_COUNT

  const entries = await getAllEntries(storage)
  const sorted = [...entries].sort((a, b) => b.lastViewedAt - a.lastViewedAt)

  let totalBytes = 0
  const kept: PrCacheEntry[] = []
  const evicted: PrCacheEntry[] = []
  for (const [index, entry] of sorted.entries()) {
    totalBytes += entry.sizeBytes
    if (index < maxEntries && totalBytes <= maxBytes)
      kept.push(entry)
    else
      evicted.push(entry)
  }

  if (evicted.length === 0)
    return

  await Promise.all(evicted.map(entry => storage.removeItem(prKey(entry.key))))

  const remainingShas = new Set(kept.flatMap(entry => entry.diff.files.map(file => file.sha)))
  await pruneOrphanedReviewed(storage, remainingShas)
}
