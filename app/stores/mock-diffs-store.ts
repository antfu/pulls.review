import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AnalyzeProgress, GroupedResult, GroupSource } from '../types/analyze'
import type { DiffsPayload } from '../types/diff'
import type { DiffsStore } from './types'
import { computed, reactive, ref, shallowRef } from 'vue'
import { resolveGroups } from '../components/diff/group-utils'

/**
 * In-memory `DiffsStore` for Storybook stories and tests: same interface as
 * `createDiffsStore`, but never touches cache/network/providers/adapters. `load`/
 * `refresh` are no-ops since the data is already seeded; `reanalyze` just flips
 * `hasAiResult` on rather than calling the real `llm` adapter.
 */
export function createMockDiffsStore(input: {
  diff?: DiffsPayload
  grouped?: GroupedResult
  reviewed?: Iterable<string>
  isLoading?: boolean
  error?: Error
  isStale?: boolean
  isSetup?: boolean
  llm?: boolean
  isAnalyzing?: boolean
  llmProgress?: AnalyzeProgress
  llmError?: Error
  chatMessages?: AgentMessage[]
  chatStreaming?: boolean
  chatError?: Error
  chatAvailable?: boolean
  layout?: 'split' | 'unified'
  isEmbedded?: boolean
}): DiffsStore {
  const llmEnabled = input.llm ?? true

  const diff = ref(input.diff)
  const grouped = ref(input.grouped)
  const isLoading = ref(input.isLoading ?? false)
  const error = ref(input.error)
  const isStale = ref(input.isStale ?? false)
  const reviewed = ref(new Set(input.reviewed ?? []))
  const analyzeMode = ref<GroupSource>(grouped.value?.source ?? (llmEnabled ? 'llm' : 'rule-based'))
  const isAnalyzing = ref(input.isAnalyzing ?? false)
  const llmProgress = ref(input.llmProgress)
  const llmError = ref(input.llmError)
  const hasAiResultOverride = ref(grouped.value?.source === 'llm')
  const isSetup = computed(() => input.isSetup ?? true)
  const hasAiResult = computed(() => hasAiResultOverride.value)
  const groups = computed(() => diff.value && grouped.value ? resolveGroups(grouped.value.groups, diff.value.files) : [])
  // A local ref, not the app's real `state/layout.ts` singleton - a story/test's layout
  // choice shouldn't leak into (or be affected by) the real app's persisted preference.
  const layout = ref(input.layout ?? 'unified')

  const chatMessages = shallowRef(input.chatMessages ?? [])
  const chat = reactive({
    available: input.chatAvailable ?? true,
    messages: chatMessages,
    isStreaming: input.chatStreaming ?? false,
    error: input.chatError,
    async send(text: string) {
      chatMessages.value = [...chatMessages.value, { role: 'user', content: text, timestamp: Date.now() }]
    },
    async retry() {},
    stop() {},
    async clear() {},
  })

  async function load() {}
  async function refresh() {}

  async function toggleReviewed(sha: string, isReviewed: boolean) {
    const next = new Set(reviewed.value)
    if (isReviewed)
      next.add(sha)
    else
      next.delete(sha)
    reviewed.value = next
  }

  async function setAnalyzeMode(mode: GroupSource) {
    analyzeMode.value = mode
  }

  async function reanalyze() {
    hasAiResultOverride.value = true
    analyzeMode.value = 'llm'
  }

  const ui = reactive({
    layout,
    isEmbedded: input.isEmbedded ?? false,
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
    ui,
    llm: llmEnabled
      ? reactive({
          isSetup,
          isAnalyzing,
          progress: llmProgress,
          error: llmError,
          hasAiResult,
          analyzeMode,
          setAnalyzeMode,
          reanalyze,
          chat,
        })
      : undefined,
    load,
    refresh,
    toggleReviewed,
  }) as DiffsStore
}
