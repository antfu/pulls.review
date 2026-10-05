import type { Storage } from 'unstorage'
import type { GroupedResult } from '../types/analyze'
import type { ReviewData } from '../types/comment-threads'
import type { DiffsPayload } from '../types/diff'
import type { ReviewMarks } from './review-marks'
import type { LlmSession, PersistedGroupSource, PrCacheBody, PrCacheEntry, PrCacheMeta } from './schema'
import * as v from 'valibot'
import { PrCacheBodySchema, PrCacheMetaSchema } from './schema'

const META_PREFIX = 'pr-meta:'
const BODY_PREFIX = 'pr-body:'
/** Entries from before the meta/body split: never readable again, so eviction drops them. */
const LEGACY_PREFIX = 'pr:'
export const DEFAULT_MAX_BUDGET_BYTES = 50 * 1024 * 1024
export const DEFAULT_MAX_ENTRY_COUNT = 50

export interface CacheBudget {
  maxBytes?: number
  maxEntries?: number
}

export interface DiffCache {
  get: (key: string) => Promise<PrCacheEntry | undefined>
  /** Writes a whole entry as given, replacing what was there. */
  put: (entry: PrCacheEntry) => Promise<void>
  /**
   * Stores a freshly fetched diff under `key`, keeping whatever the existing entry
   * already holds (AI analyses, chat session, review data, shared comment): those
   * were paid for and stay useful against a newer diff via `resolveGroups`.
   */
  putDiff: (key: string, diff: DiffsPayload, headSha: string) => Promise<PrCacheEntry>
  touch: (key: string) => Promise<void>
  setChangedSinceReviewed: (key: string, paths: string[]) => Promise<void>
  setAnalyzedResult: (key: string, source: PersistedGroupSource, result: GroupedResult) => Promise<void>
  setLlmSession: (key: string, session: LlmSession | undefined) => Promise<void>
  setSharedComment: (key: string, sharedComment: PrCacheEntry['sharedComment']) => Promise<void>
  setReviewData: (key: string, reviews: ReviewData) => Promise<void>
  /** Most-recently-viewed first. Reads metadata only. */
  listRecent: (limit: number) => Promise<PrCacheMeta[]>
  /** Whole entries whose metadata matches; only those bodies are read. */
  listMatching: (match: (meta: PrCacheMeta) => boolean) => Promise<PrCacheEntry[]>
}

/** Rough approximation of an entry's on-disk footprint, used for LRU budget accounting. */
export function computeEntrySizeBytes(diff: DiffsPayload, analyzedBy: PrCacheBody['analyzedBy'], llmSession?: PrCacheBody['llmSession'] | LlmSession): number {
  return new TextEncoder().encode(JSON.stringify({ diff, analyzedBy, llmSession })).length
}

function split(entry: PrCacheEntry): { meta: PrCacheMeta, body: PrCacheBody } {
  const { diff, analyzedBy, reviews, llmSession, ...rest } = entry
  const meta: PrCacheMeta = {
    ...rest,
    ref: diff.ref,
    title: diff.title,
    label: diff.label,
    url: diff.url,
    pullRequestState: diff.pullRequest?.state,
    additions: diff.files.reduce((sum, file) => sum + file.additions, 0),
    deletions: diff.files.reduce((sum, file) => sum + file.deletions, 0),
    fileShas: diff.files.map(file => file.sha),
  }
  return { meta, body: { diff, analyzedBy, reviews, llmSession } }
}

function join(meta: PrCacheMeta, body: PrCacheBody): PrCacheEntry {
  const { key, headSha, lastViewedAt, sizeBytes, sharedComment, changedSinceReviewed } = meta
  return { key, headSha, lastViewedAt, sizeBytes, sharedComment, changedSinceReviewed, ...body }
}

/**
 * Cached diffs, split into a `pr-meta:*` and a `pr-body:*` document per key so
 * eviction and listing never load whole diffs. Writes to one key run one at a
 * time, so overlapping read-modify-writes (a review refetch next to a shared-result
 * load) can't drop each other's changes.
 */
export function createDiffCache(storage: Storage, reviewMarks: ReviewMarks, budget: CacheBudget = {}): DiffCache {
  const maxBytes = budget.maxBytes ?? DEFAULT_MAX_BUDGET_BYTES
  const maxEntries = budget.maxEntries ?? DEFAULT_MAX_ENTRY_COUNT
  const queues = new Map<string, Promise<unknown>>()

  function exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(key) ?? Promise.resolve()).then(task, task)
    const settled = run.catch(() => {})
    queues.set(key, settled)
    void settled.then(() => {
      if (queues.get(key) === settled)
        queues.delete(key)
    })
    return run
  }

  async function getMeta(key: string): Promise<PrCacheMeta | undefined> {
    const result = v.safeParse(PrCacheMetaSchema, await storage.getItem(`${META_PREFIX}${key}`))
    return result.success ? result.output : undefined
  }

  async function getBody(key: string): Promise<PrCacheBody | undefined> {
    const result = v.safeParse(PrCacheBodySchema, await storage.getItem(`${BODY_PREFIX}${key}`))
    return result.success ? result.output : undefined
  }

  async function get(key: string): Promise<PrCacheEntry | undefined> {
    const [meta, body] = await Promise.all([getMeta(key), getBody(key)])
    // A missing half, or a corrupt / previous-shape one, is a cache miss rather than a crash.
    return meta && body ? join(meta, body) : undefined
  }

  async function write(entry: PrCacheEntry): Promise<void> {
    const { meta, body } = split(entry)
    await Promise.all([
      storage.setItem(`${META_PREFIX}${entry.key}`, meta),
      storage.setItem(`${BODY_PREFIX}${entry.key}`, body),
    ])
  }

  function updateMeta(key: string, patch: (meta: PrCacheMeta) => PrCacheMeta): Promise<void> {
    return exclusive(key, async () => {
      const meta = await getMeta(key)
      if (meta)
        await storage.setItem(`${META_PREFIX}${key}`, patch(meta))
    })
  }

  function updateBody(key: string, patch: (body: PrCacheBody) => PrCacheBody): Promise<void> {
    return exclusive(key, async () => {
      const body = await getBody(key)
      if (body)
        await storage.setItem(`${BODY_PREFIX}${key}`, patch(body))
    })
  }

  async function listMetas(): Promise<PrCacheMeta[]> {
    const keys = await storage.getKeys(META_PREFIX)
    const metas: PrCacheMeta[] = []
    for (const { value } of await storage.getItems(keys)) {
      const result = v.safeParse(PrCacheMetaSchema, value)
      if (result.success)
        metas.push(result.output)
    }
    return metas
  }

  async function enforceBudget(): Promise<void> {
    const legacy = await storage.getKeys(LEGACY_PREFIX)
    await Promise.all(legacy.map(key => storage.removeItem(key)))

    const sorted = (await listMetas()).sort((a, b) => b.lastViewedAt - a.lastViewedAt)
    let totalBytes = 0
    const kept: PrCacheMeta[] = []
    const evicted: PrCacheMeta[] = []
    for (const [index, meta] of sorted.entries()) {
      totalBytes += meta.sizeBytes
      if (index < maxEntries && totalBytes <= maxBytes)
        kept.push(meta)
      else
        evicted.push(meta)
    }
    if (evicted.length === 0)
      return

    await Promise.all(evicted.flatMap(meta => [
      storage.removeItem(`${META_PREFIX}${meta.key}`),
      storage.removeItem(`${BODY_PREFIX}${meta.key}`),
    ]))
    await reviewMarks.prune(new Set(kept.flatMap(meta => meta.fileShas)))
  }

  /**
   * Paths of `diff` whose previous `sha` was reviewed but has since changed, plus the
   * still-present paths already flagged on `existing` - a flag only clears when the
   * user marks the file again (`setChangedSinceReviewed`), not by further commits.
   */
  async function changedSinceReviewed(existing: PrCacheEntry, diff: DiffsPayload): Promise<string[]> {
    const previousSha = new Map(existing.diff.files.map(file => [file.path, file.sha]))
    const reviewed = await reviewMarks.get([...previousSha.values()])
    const flagged = new Set(existing.changedSinceReviewed)
    return diff.files
      .filter((file) => {
        const previous = previousSha.get(file.path)
        return flagged.has(file.path) || (previous !== undefined && previous !== file.sha && reviewed.has(previous))
      })
      .map(file => file.path)
  }

  return {
    get,
    async put(entry) {
      await exclusive(entry.key, () => write(entry))
      await enforceBudget()
    },
    async putDiff(key, diff, headSha) {
      const entry = await exclusive(key, async () => {
        const existing = await get(key)
        const analyzedBy = existing?.analyzedBy ?? {}
        const next: PrCacheEntry = {
          ...existing,
          key,
          diff,
          headSha,
          analyzedBy,
          lastViewedAt: Date.now(),
          sizeBytes: computeEntrySizeBytes(diff, analyzedBy, existing?.llmSession),
          changedSinceReviewed: existing ? await changedSinceReviewed(existing, diff) : [],
        }
        await write(next)
        return next
      })
      await enforceBudget()
      return entry
    },
    touch: key => updateMeta(key, meta => ({ ...meta, lastViewedAt: Date.now() })),
    setChangedSinceReviewed: (key, paths) => updateMeta(key, meta => ({ ...meta, changedSinceReviewed: paths })),
    setSharedComment: (key, sharedComment) => updateMeta(key, meta => ({ ...meta, sharedComment })),
    setAnalyzedResult: (key, source, result) => updateBody(key, body => ({ ...body, analyzedBy: { ...body.analyzedBy, [source]: result } })),
    setReviewData: (key, reviews) => updateBody(key, body => ({ ...body, reviews })),
    async setLlmSession(key, session) {
      await exclusive(key, async () => {
        const entry = await get(key)
        if (!entry)
          return
        // The persisted session keeps only the fields the schema checks; `AgentMessage` is wider.
        const llmSession = session as PrCacheBody['llmSession']
        await write({ ...entry, llmSession, sizeBytes: computeEntrySizeBytes(entry.diff, entry.analyzedBy, llmSession) })
      })
      await enforceBudget()
    },
    async listRecent(limit) {
      return (await listMetas()).sort((a, b) => b.lastViewedAt - a.lastViewedAt).slice(0, limit)
    },
    async listMatching(match) {
      const metas = (await listMetas()).filter(match)
      const entries = await Promise.all(metas.map(async (meta) => {
        const body = await getBody(meta.key)
        return body && join(meta, body)
      }))
      return entries.filter(entry => entry !== undefined)
    },
  }
}
