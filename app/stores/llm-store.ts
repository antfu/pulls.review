import type { Ref } from 'vue'
import type { AnalyzeProgress, GroupedResult } from '../types/analyze'
import type { LlmSession } from '../types/cache'
import type { DiffsPayload } from '../types/diff'
import type { DiffsStoreLlm } from './types'
import { computed, reactive, ref } from 'vue'
import { llmAdapter, runLlmAnalysis } from '../analyze/adapters/llm'
import { setAnalyzedResult, setLlmSession } from '../cache/pr-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { useLlmChat } from '../composables/useLlmChat'

export interface LlmStoreOptions {
  diff: Ref<DiffsPayload | undefined>
  /** The analysis transcript the chat continues from; `createDiffsStore` owns it because it is loaded from and reset with the PR cache entry. */
  session: Ref<LlmSession | undefined>
  /** PR cache key of the loaded diff; unset until the diff loads. */
  getCacheKey: () => string | undefined
  /** Publishes a fresh AI result as `analyzedBy.llm`. */
  setResult: (result: GroupedResult) => void
  /** Switches the view onto the `llm` grouping once a run has finished. */
  showLlmResult: () => Promise<void>
}

export interface LlmStore extends DiffsStoreLlm {
  /** Aborts the in-flight run and chat: the diff they were for is being replaced. */
  abort: () => void
}

/**
 * The LLM sub-store behind `DiffsStore.llm` - analysis runs, their progress/error, and
 * follow-up chat. Only ever loaded by `createDiffsStore` via `import()` behind
 * `import.meta.env.PR_LLM`, so a build with the flag off ships none of it.
 */
export function createLlmStore(opts: LlmStoreOptions): LlmStore {
  const isAnalyzing = ref(false)
  const progress = ref<AnalyzeProgress>()
  const error = ref<Error>()
  const isSetup = computed(() => llmAdapter.available)
  let abortController: AbortController | undefined

  async function setSession(session: LlmSession) {
    opts.session.value = session
    const key = opts.getCacheKey()
    if (key)
      await setLlmSession(await getDefaultCacheStorage(), key, session)
  }

  async function setResult(result: GroupedResult) {
    opts.setResult(result)
    const key = opts.getCacheKey()
    if (key)
      await setAnalyzedResult(await getDefaultCacheStorage(), key, 'llm', result)
  }

  const chat = useLlmChat({
    diff: opts.diff,
    session: opts.session,
    onSessionChange: setSession,
    onGroupingUpdate: setResult,
  })

  async function reanalyze() {
    const currentDiff = opts.diff.value
    if (!currentDiff)
      return
    chat.stop()
    error.value = undefined
    isAnalyzing.value = true
    const controller = new AbortController()
    abortController = controller
    try {
      const { result, transcript } = await runLlmAnalysis(currentDiff, {
        onProgress: next => progress.value = next,
        signal: controller.signal,
      })
      if (controller.signal.aborted)
        return
      await setResult(result)
      await setSession({ messages: transcript, chatStartIndex: transcript.length })
    }
    catch (err) {
      if (!controller.signal.aborted)
        error.value = err instanceof Error ? err : new Error(String(err))
    }
    finally {
      if (abortController === controller)
        abortController = undefined
      progress.value = undefined
      isAnalyzing.value = false
    }
    await opts.showLlmResult()
  }

  function abort() {
    chat.stop()
    abortController?.abort()
  }

  return reactive({
    isSetup,
    isAnalyzing,
    progress,
    error,
    reanalyze,
    chat: reactive(chat),
    abort,
  }) as LlmStore
}
