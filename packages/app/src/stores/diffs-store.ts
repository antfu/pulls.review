import type { CacheRepositories, LlmSession, PrCacheEntry } from '@pulls.review/core/cache'
import type { DiffSource, DiffsPayload, FileChange, GroupedResult, GroupSource, ReviewData } from '@pulls.review/core/types'
import type { LlmRunner } from '../analyze/llm-runner'
import type { DiffsStore, DiffsStoreLlm } from './types'
import { computed, getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import { resolveAdapter, ruleBasedAdapter } from '../analyze'
import { resolveGroups } from '../components/diff/group-utils'
import { i18n, t } from '../i18n'
import { autoRefresh } from '../state/auto-refresh'
import { layout } from '../state/layout'
import { createReviewsStore } from './reviews-store'
import { createSharedAnalysisStore } from './shared-analysis-store'
import { createWriteAccess } from './write-access'

/**
 * Creates a `DiffsStore` backed by a real source, cache and adapters - the isomorphic
 * counterpart to `createMockDiffsStore`. What the store offers follows from what the
 * source can do, never from which kind of source it is.
 */
export interface DiffsStoreOptions {
  cache: CacheRepositories
  /** Where AI analysis runs; absent in a build without LLM support (the embed), which then has no `store.llm`. */
  llm?: LlmRunner
  /** Login from the page's `?from=` query: load that user's shared analysis (see plans/07). */
  from?: string
}

export function createDiffsStore(source: DiffSource, opts: DiffsStoreOptions): DiffsStore {
  const { cache } = opts
  const diff = ref<DiffsPayload>()
  const analyzedBy = ref<Partial<Record<GroupSource, GroupedResult>>>({})
  const isLoading = ref(false)
  const error = ref<Error>()
  const isStale = ref(false)
  // `llm` even when `PR_LLM` is off: `grouped` falls back to rule-based until an AI
  // result exists, and the embed can still hold one loaded from a shared comment.
  const analyzeMode = ref<GroupSource>('llm')
  const cacheKey = ref<string>()
  const reviewed = ref(new Set<string>())
  const changedSinceReviewed = ref(new Set<string>())
  const llmSession = shallowRef<LlmSession>()
  const llm = shallowRef<DiffsStoreLlm>()

  if (getCurrentScope())
    onScopeDispose(() => llm.value?.abort())

  // SWR seeds for the sub-stores, set when a cached PR entry carries them.
  let cachedReviewData: ReviewData | undefined
  let cachedSharedComment: PrCacheEntry['sharedComment']

  const access = createWriteAccess(source.viewer ?? (async () => undefined), source.auth)

  const reviews = source.reviews
    ? createReviewsStore(source.reviews, {
        cache,
        access,
        getHeadSha: () => diff.value?.head?.sha,
        getCacheKey: () => cacheKey.value,
        cachedData: () => cachedReviewData,
      })
    : undefined

  // Falls back to the always-instant rule-based grouping while the selected mode
  // (currently only `llm` can be in this state) hasn't been analyzed yet for this
  // diff, so the header/view never lose their data just from switching modes.
  const grouped = computed(() => analyzedBy.value[analyzeMode.value] ?? analyzedBy.value['rule-based'])
  const aiResult = computed(() => analyzedBy.value.llm ?? analyzedBy.value['web-llm'])
  const groups = computed(() => diff.value && grouped.value ? resolveGroups(grouped.value.groups, diff.value.files) : [])

  // The flag is a compile-time literal: with it off, this `import()` is dead code and the
  // whole LLM sub-store (runs, chat, the pi runtime behind them) stays out of the bundle.
  // `load()` awaits it so `store.llm` is set by the time the diff renders.
  const runner = opts.llm
  const llmReady = import.meta.env.PR_LLM && runner
    ? import('./llm-store').then(({ createLlmStore }) => {
        llm.value = createLlmStore({
          cache,
          runner,
          diff,
          session: llmSession,
          getCacheKey: () => cacheKey.value,
          setResult: result => analyzedBy.value = { ...analyzedBy.value, llm: result },
          showLlmResult: () => setAnalyzeMode('llm'),
        })
      })
    : undefined

  async function loadReviewed() {
    if (!diff.value)
      return
    reviewed.value = await cache.reviewMarks.get(diff.value.files.map(file => file.sha))
  }

  async function setReviewed(shas: string[], isReviewed: boolean) {
    await cache.reviewMarks.set(shas, isReviewed)
    const next = new Set(reviewed.value)
    for (const sha of shas)
      isReviewed ? next.add(sha) : next.delete(sha)
    reviewed.value = next

    // Either direction is the user's explicit verdict on the file's current content,
    // so the "changed since you reviewed it" flag has served its purpose.
    const touched = new Set(shas)
    const paths = diff.value?.files.filter(file => touched.has(file.sha)).map(file => file.path) ?? []
    if (!paths.some(path => changedSinceReviewed.value.has(path)))
      return
    const remaining = new Set(changedSinceReviewed.value)
    for (const path of paths)
      remaining.delete(path)
    changedSinceReviewed.value = remaining
    if (cacheKey.value)
      await cache.diffs.setChangedSinceReviewed(cacheKey.value, [...remaining])
  }

  /** The free, instant modes; `llm` runs only through `llm.reanalyze` (see `llm-store.ts`). */
  async function runAnalysis(mode: Exclude<GroupSource, 'llm'>) {
    if (!diff.value)
      return
    // Cheap, deterministic modes are never persisted: recomputing keeps them exact
    // against the current diff, where a cached copy could only go stale.
    const result = await resolveAdapter(mode).analyze(diff.value)
    analyzedBy.value = { ...analyzedBy.value, [mode]: result }
  }

  // The free modes' labels are translated when computed, so a language change recomputes them.
  watch(i18n.global.locale, () => {
    for (const mode of ['rule-based', 'none'] as const) {
      if (analyzedBy.value[mode])
        void runAnalysis(mode)
    }
  })

  async function setAnalyzeMode(mode: GroupSource) {
    analyzeMode.value = mode
    // `llm` is never auto-run - a paid/slow call must always be an explicit click
    // (the "(Re-)Analyze with AI" button), never a side effect of flipping a switch.
    if (mode !== 'llm' && analyzedBy.value[mode] === undefined)
      await runAnalysis(mode)
  }

  /** A shared result replaces any in-flight run and the chat transcript: it has no session of its own. */
  async function applySharedResult(result: GroupedResult) {
    const source = result.source
    if (source !== 'llm' && source !== 'web-llm')
      return
    llm.value?.abort()
    analyzedBy.value = { ...analyzedBy.value, [source]: result }
    llmSession.value = undefined
    analyzeMode.value = source
    if (cacheKey.value) {
      await cache.diffs.setAnalyzedResult(cacheKey.value, source, result)
      await cache.diffs.setLlmSession(cacheKey.value, undefined)
    }
  }

  const shared = source.sharing
    ? createSharedAnalysisStore(source.sharing, {
        cache,
        access,
        getDiff: () => diff.value,
        getCacheKey: () => cacheKey.value,
        getAiResult: () => aiResult.value,
        cachedComment: () => cachedSharedComment,
        applyResult: applySharedResult,
      })
    : undefined

  /**
   * Installs a diff plus whatever was persisted for it. The AI result and chat session
   * are kept on purpose: `resolveGroups` reconciles them against the newer diff, so a
   * refresh never throws away a paid analysis.
   */
  async function install(key: string, entry: Pick<PrCacheEntry, 'diff' | 'analyzedBy' | 'llmSession' | 'changedSinceReviewed'>) {
    diff.value = entry.diff
    cacheKey.value = key
    changedSinceReviewed.value = new Set(entry.changedSinceReviewed)
    analyzedBy.value = { ...entry.analyzedBy, 'rule-based': await ruleBasedAdapter.analyze(entry.diff) }
    llmSession.value = entry.llmSession as LlmSession | undefined
    await loadReviewed()
  }

  async function analyzeAndStore(key: string, freshDiff: DiffsPayload) {
    // An in-flight run analyzed the diff being replaced; the last persisted result stands.
    llm.value?.abort()
    const entry = await cache.diffs.putDiff(key, freshDiff, freshDiff.head?.sha ?? '')
    await install(key, entry)
    // `llm` is never auto-run, even here - a paid/slow call must always be an explicit
    // click (the "(Re-)Analyze with AI" button), never a side effect of loading or
    // refreshing a diff. Only the free/instant modes re-run automatically.
    const mode = analyzeMode.value
    if (mode !== 'rule-based' && mode !== 'llm')
      await runAnalysis(mode)
  }

  async function fetchFresh() {
    const key = await source.key()
    await analyzeAndStore(key, await source.fetch())
  }

  async function checkStaleness(cachedHeadSha: string) {
    if (!source.fingerprint)
      return
    try {
      if (await source.fingerprint() === cachedHeadSha)
        return
      // The user opted into auto-refresh (banner checkbox or Settings): fetch the new
      // commits silently instead of parking behind the "new commits" banner.
      if (autoRefresh.value)
        await refresh()
      else
        isStale.value = true
    }
    catch {
      // Non-fatal: the cached view still renders even if the cheap staleness check fails.
    }
  }

  async function load() {
    isLoading.value = true
    error.value = undefined
    isStale.value = false
    try {
      const key = await source.key()
      const cached = await cache.diffs.get(key)
      if (cached) {
        cachedReviewData = cached.reviews
        cachedSharedComment = cached.sharedComment
        await cache.diffs.touch(key)
        await install(key, cached)
        void checkStaleness(cached.headSha)
      }
      else {
        await fetchFresh()
      }
      // Threads and shared analyses load after (and independently of) the diff -
      // a failure there never blocks the diff view itself.
      void reviews?.load()
      void shared?.discover(opts.from)
      await llmReady
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      isLoading.value = false
    }
  }

  async function refresh() {
    isLoading.value = true
    error.value = undefined
    try {
      await fetchFresh()
      isStale.value = false
      void reviews?.load()
      void shared?.discover()
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      isLoading.value = false
    }
  }

  const { loadFile } = source
  const fileContent = loadFile && {
    async load(file: FileChange) {
      const loaded = diff.value
      const key = cacheKey.value
      if (!loaded?.base || !loaded.head || !key)
        throw new Error(t('errors.diffNotLoaded'))
      const loadSide = async (path: string, sha: string) => {
        const cached = await cache.fileContents.get(key, sha, path)
        if (cached !== undefined)
          return cached
        const content = await loadFile(path, sha)
        if (content !== undefined)
          await cache.fileContents.set(key, sha, path, content)
        return content
      }
      const [old, current] = await Promise.all([
        file.status === 'added' ? undefined : loadSide(file.previousPath ?? file.path, loaded.base.sha),
        file.status === 'removed' ? undefined : loadSide(file.path, loaded.head.sha),
      ])
      return { old, new: current }
    },
  }

  const ui = reactive({
    layout,
    setLayout: (mode: 'split' | 'unified') => { layout.value = mode },
  })

  return reactive({
    diff,
    grouped,
    isLoading,
    error,
    isStale,
    reviewed,
    changedSinceReviewed,
    groups,
    aiResult,
    analyzeMode,
    setAnalyzeMode,
    ui,
    llm,
    reviews,
    shared: shared?.store,
    fileContent,
    canRefresh: !!source.fingerprint,
    auth: source.auth,
    load,
    refresh,
    setReviewed,
  }) as DiffsStore
}
