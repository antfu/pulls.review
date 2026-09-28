import type { AnalyzeProgress, GroupedResult, GroupSource } from '../types/analyze'
import type { LlmSession, PrCacheEntry } from '../types/cache'
import type { ReviewData } from '../types/comment-threads'
import type { DiffsPayload } from '../types/diff'
import type { FetchDiffParams } from '../types/provider'
import type { DiffsStore } from './types'
import { computed, getCurrentScope, onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { resolveAdapter } from '../analyze'
import { llmAdapter, runLlmAnalysis } from '../analyze/adapters/llm'
import { ruleBasedAdapter } from '../analyze/adapters/rule-based'
import { computeEntrySizeBytes, getEntry, putEntry, setAnalyzedResult, setLlmSession, touchEntry } from '../cache/pr-cache'
import { getReviewed, setReviewed } from '../cache/review-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { resolveGroups } from '../components/diff/group-utils'
import { useLlmChat } from '../composables/useLlmChat'
import { useProvider } from '../composables/useProvider'
import { fetchPullRequest } from '../providers/github/api'
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
  llm?: boolean
  isEmbedded?: boolean
  /** Login from the page's `?from=` query: load that user's shared analysis (see plans/07). */
  from?: string
}

export function createDiffsStore(params: FetchDiffParams, opts: DiffsStoreOptions = {}): DiffsStore {
  const llmEnabled = opts.llm ?? true

  const diff = ref<DiffsPayload>()
  const analyzedBy = ref<Partial<Record<GroupSource, GroupedResult>>>({})
  const isLoading = ref(false)
  const error = ref<Error>()
  const isStale = ref(false)
  // `llm` even when `llmEnabled` is off: `grouped` falls back to rule-based until an AI
  // result exists, and the embed can still hold one loaded from a shared comment.
  const analyzeMode = ref<GroupSource>('llm')
  const isAnalyzing = ref(false)
  const cacheKey = ref<string>()
  const reviewed = ref(new Set<string>())
  const llmProgress = ref<AnalyzeProgress>()
  const llmError = ref<Error>()
  const llmSession = shallowRef<LlmSession>()
  let llmAbortController: AbortController | undefined

  if (getCurrentScope())
    onScopeDispose(() => llmAbortController?.abort())

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
  const isSetup = computed(() => llmAdapter.available)
  const groups = computed(() => diff.value && grouped.value ? resolveGroups(grouped.value.groups, diff.value.files) : [])

  const chat = useLlmChat({
    diff,
    session: llmSession,
    async onSessionChange(session) {
      llmSession.value = session
      if (cacheKey.value)
        await setLlmSession(await getDefaultCacheStorage(), cacheKey.value, session)
    },
    async onGroupingUpdate(result) {
      analyzedBy.value = { ...analyzedBy.value, llm: result }
      if (cacheKey.value)
        await setAnalyzedResult(await getDefaultCacheStorage(), cacheKey.value, 'llm', result)
    },
  })

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

  async function runLlmAnalysisAndStore(currentDiff: DiffsPayload) {
    chat.stop()
    llmError.value = undefined
    const controller = new AbortController()
    llmAbortController = controller
    try {
      const { result, transcript } = await runLlmAnalysis(currentDiff, {
        onProgress: progress => llmProgress.value = progress,
        signal: controller.signal,
      })
      if (controller.signal.aborted)
        return
      analyzedBy.value = { ...analyzedBy.value, llm: result }
      llmSession.value = { messages: transcript, chatStartIndex: transcript.length }
      if (cacheKey.value) {
        const storage = await getDefaultCacheStorage()
        await setAnalyzedResult(storage, cacheKey.value, 'llm', result)
        await setLlmSession(storage, cacheKey.value, llmSession.value)
      }
    }
    catch (err) {
      if (!controller.signal.aborted)
        llmError.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      if (llmAbortController === controller)
        llmAbortController = undefined
    }
  }

  async function runAnalysis(mode: GroupSource) {
    if (!diff.value)
      return
    isAnalyzing.value = true
    try {
      if (mode === 'llm') {
        await runLlmAnalysisAndStore(diff.value)
        return
      }

      const result = await resolveAdapter(mode).analyze(diff.value)
      analyzedBy.value = { ...analyzedBy.value, [mode]: result }
      if (cacheKey.value) {
        const storage = await getDefaultCacheStorage()
        await setAnalyzedResult(storage, cacheKey.value, mode, result)
      }
    }
    finally {
      llmProgress.value = undefined
      isAnalyzing.value = false
    }
  }

  async function setAnalyzeMode(mode: GroupSource) {
    analyzeMode.value = mode
    // `llm` is never auto-run - a paid/slow call must always be an explicit click
    // (the "(Re-)Analyze with AI" button), never a side effect of flipping a switch.
    if (mode !== 'llm' && analyzedBy.value[mode] === undefined)
      await runAnalysis(mode)
  }

  async function reanalyze() {
    await runAnalysis('llm')
    await setAnalyzeMode('llm')
  }

  /** A shared result replaces any in-flight run and the chat transcript: it has no session of its own. */
  async function applySharedResult(result: GroupedResult) {
    chat.stop()
    llmAbortController?.abort()
    analyzedBy.value = { ...analyzedBy.value, [result.source]: result }
    llmSession.value = undefined
    analyzeMode.value = result.source
    if (cacheKey.value) {
      const storage = await getDefaultCacheStorage()
      await setAnalyzedResult(storage, cacheKey.value, result.source, result)
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

  async function analyzeAndStore(key: string, freshDiff: DiffsPayload) {
    chat.stop()
    llmAbortController?.abort()
    const storage = await getDefaultCacheStorage()
    const result = await ruleBasedAdapter.analyze(freshDiff)
    diff.value = freshDiff
    cacheKey.value = key
    const freshAnalyzedBy = { 'rule-based': result }
    analyzedBy.value = freshAnalyzedBy
    llmSession.value = undefined
    await putEntry(storage, {
      key,
      diff: freshDiff,
      headSha: freshDiff.head?.sha ?? '',
      analyzedBy: freshAnalyzedBy,
      lastViewedAt: Date.now(),
      sizeBytes: computeEntrySizeBytes(freshDiff, freshAnalyzedBy),
    })
    await loadReviewed()
    // `llm` is never auto-run, even here - a paid/slow call must always be an explicit
    // click (the "(Re-)Analyze with AI" button), never a side effect of loading or
    // refreshing a diff. Only the free/instant modes re-run automatically.
    if (analyzeMode.value !== 'rule-based' && analyzeMode.value !== 'llm')
      await runAnalysis(analyzeMode.value)
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
      isStale.value = pr.head.sha !== cachedHeadSha
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
          diff.value = cached.diff
          cacheKey.value = key
          analyzedBy.value = cached.analyzedBy
          llmSession.value = cached.llmSession as LlmSession | undefined
          cachedReviewData = cached.reviews
          cachedSharedComment = cached.sharedComment
          await touchEntry(storage, key)
          await loadReviewed()
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
          diff.value = cached.diff
          cacheKey.value = key
          analyzedBy.value = cached.analyzedBy
          llmSession.value = cached.llmSession as LlmSession | undefined
          await touchEntry(storage, key)
          await loadReviewed()
        }
        else {
          await analyzeAndStore(key, freshDiff)
        }
      }
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
    isEmbedded: opts.isEmbedded ?? false,
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
    llm: llmEnabled
      ? reactive({
          isSetup,
          isAnalyzing,
          progress: llmProgress,
          error: llmError,
          reanalyze,
          chat: reactive(chat),
        })
      : undefined,
    reviews,
    shared: shared?.store,
    load,
    refresh,
    toggleReviewed,
  }) as DiffsStore
}
