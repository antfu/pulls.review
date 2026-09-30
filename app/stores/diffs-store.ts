import type { GroupedResult, GroupSource } from '../types/analyze'
import type { LlmSession, PrCacheEntry } from '../types/cache'
import type { ReviewData } from '../types/comment-threads'
import type { DiffsPayload } from '../types/diff'
import type { FetchDiffParams } from '../types/provider'
import type { DiffsStore, DiffsStoreLlm } from './types'
import { computed, getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import { resolveAdapter } from '../analyze'
import { ruleBasedAdapter } from '../analyze/adapters/rule-based'
import { getEntry, putDiff, setAnalyzedResult, setLlmSession, touchEntry } from '../cache/pr-cache'
import { getReviewed, setReviewed } from '../cache/review-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { resolveGroups } from '../components/diff/group-utils'
import { useProvider } from '../composables/useProvider'
import { i18n } from '../i18n'
import { fetchPullRequest } from '../providers/github/api'
import { autoRefresh } from '../state/auto-refresh'
import { layout } from '../state/layout'
import { createGithubWriteAccess } from './github-write-access'
import { createReviewsStore } from './reviews-store'
import { createSharedAnalysisStore } from './shared-analysis-store'

/**
 * Creates a `DiffsStore` backed by real providers/cache/adapters - the isomorphic
 * counterpart to `createMockDiffsStore`. Works for both `github-pr` and `patch-text`
 * params, matching `FetchDiffParams`'s discriminated union.
 */
export interface DiffsStoreOptions {
  token?: string
  /** Login from the page's `?from=` query: load that user's shared analysis (see plans/07). */
  from?: string
}

export function createDiffsStore(params: FetchDiffParams, opts: DiffsStoreOptions = {}): DiffsStore {
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
  const llmSession = shallowRef<LlmSession>()
  const llm = shallowRef<DiffsStoreLlm>()

  if (getCurrentScope())
    onScopeDispose(() => llm.value?.abort())

  // SWR seeds for the sub-stores, set when a cached PR entry carries them.
  let cachedReviewData: ReviewData | undefined
  let cachedSharedComment: PrCacheEntry['sharedComment']

  const github = params.kind === 'github-pr' && useProvider('github').capabilities.supportsComments
    ? { params, access: createGithubWriteAccess(opts.token || undefined) }
    : undefined

  const reviews = github
    ? createReviewsStore(github.params, {
        token: opts.token,
        access: github.access,
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
  const llmReady = import.meta.env.PR_LLM
    ? import('./llm-store').then(({ createLlmStore }) => {
        llm.value = createLlmStore({
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
    const storage = await getDefaultCacheStorage()
    reviewed.value = await getReviewed(storage, diff.value.files.map(file => file.sha))
  }

  async function toggleReviewed(sha: string, isReviewed: boolean) {
    const storage = await getDefaultCacheStorage()
    await setReviewed(storage, sha, isReviewed)
    const next = new Set(reviewed.value)
    if (isReviewed)
      next.add(sha)
    else
      next.delete(sha)
    reviewed.value = next
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
      const storage = await getDefaultCacheStorage()
      await setAnalyzedResult(storage, cacheKey.value, source, result)
      await setLlmSession(storage, cacheKey.value, undefined)
    }
  }

  const shared = github
    ? createSharedAnalysisStore(github.params, {
        token: opts.token,
        access: github.access,
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
  async function install(key: string, entry: Pick<PrCacheEntry, 'diff' | 'analyzedBy' | 'llmSession'>) {
    diff.value = entry.diff
    cacheKey.value = key
    analyzedBy.value = { ...entry.analyzedBy, 'rule-based': await ruleBasedAdapter.analyze(entry.diff) }
    llmSession.value = entry.llmSession as LlmSession | undefined
    await loadReviewed()
  }

  async function analyzeAndStore(key: string, freshDiff: DiffsPayload) {
    // An in-flight run analyzed the diff being replaced; the last persisted result stands.
    llm.value?.abort()
    const storage = await getDefaultCacheStorage()
    const entry = await putDiff(storage, key, freshDiff, freshDiff.head?.sha ?? '')
    await install(key, entry)
    // `llm` is never auto-run, even here - a paid/slow call must always be an explicit
    // click (the "(Re-)Analyze with AI" button), never a side effect of loading or
    // refreshing a diff. Only the free/instant modes re-run automatically.
    const mode = analyzeMode.value
    if (mode !== 'rule-based' && mode !== 'llm')
      await runAnalysis(mode)
  }

  async function fetchFresh() {
    const provider = useProvider(params.kind === 'github-pr' ? 'github' : 'paste')
    const freshDiff = await provider.fetchDiff(params, opts)
    const key = freshDiff.id // already `github:owner/repo#number` or `paste:<contentHash>`, matching pr-cache's key scheme
    await analyzeAndStore(key, freshDiff)
    return key
  }

  async function checkStaleness(cachedHeadSha: string) {
    if (params.kind !== 'github-pr')
      return
    try {
      const pr = await fetchPullRequest(params.owner, params.repo, params.number, opts.token)
      if (pr.head.sha === cachedHeadSha)
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
      if (params.kind === 'github-pr') {
        const key = `github:${params.owner}/${params.repo}#${params.number}`
        const storage = await getDefaultCacheStorage()
        const cached = await getEntry(storage, key)
        if (cached) {
          cachedReviewData = cached.reviews
          cachedSharedComment = cached.sharedComment
          await touchEntry(storage, key)
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
      }
      else {
        // A paste has no live source: parsing is cheap and local, so always run it, then
        // let the cache short-circuit re-analysis on a same-session revisit (e.g. a reload).
        const provider = useProvider('paste')
        const freshDiff = await provider.fetchDiff(params, opts)
        const key = freshDiff.id // already `github:owner/repo#number` or `paste:<contentHash>`, matching pr-cache's key scheme
        const storage = await getDefaultCacheStorage()
        const cached = await getEntry(storage, key)
        if (cached) {
          await touchEntry(storage, key)
          await install(key, cached)
        }
        else {
          await analyzeAndStore(key, freshDiff)
        }
      }
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
    groups,
    aiResult,
    analyzeMode,
    setAnalyzeMode,
    ui,
    llm,
    reviews,
    shared: shared?.store,
    load,
    refresh,
    toggleReviewed,
  }) as DiffsStore
}
