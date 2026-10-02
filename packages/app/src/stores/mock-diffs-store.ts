import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { CommentThread, DiffsPayload, GroupedResult, GroupSource, PendingReview, ReviewDraftTarget, ReviewSummary, ReviewVerdict } from '@pulls.review/core/types'
import type { DiffsStore, DiffsStoreReviews, DiffsStoreShared, LlmProgress, SharedAnalysisCandidate } from './types'
import { computed, reactive, ref, shallowRef } from 'vue'
import { resolveGroups } from '../components/diff/group-utils'

export interface MockReviewsInput {
  threads?: CommentThread[]
  summaries?: ReviewSummary[]
  pendingReview?: PendingReview
  canWrite?: boolean
  viewerLogin?: string
  showThreads?: boolean
  writeBlockedReason?: string
}

let nextMockCommentId = 1_000_000

/**
 * In-memory `DiffsStoreReviews` mirroring `createReviewsStore`: mutations edit
 * local arrays so Storybook stories stay interactive without any network.
 */
export function createMockReviewsStore(input: MockReviewsInput = {}): DiffsStoreReviews {
  const threads = ref(input.threads ?? [])
  const summaries = ref(input.summaries ?? [])
  const pendingReview = ref(input.pendingReview)
  const viewerLogin = input.viewerLogin ?? 'octocat'
  // A local ref, like the mock's `layout` - stories never touch the persisted singleton.
  const showThreads = ref(input.showThreads ?? true)

  const pendingCommentCount = computed(() =>
    threads.value.reduce((count, thread) => count + thread.comments.filter(comment => comment.pending).length, 0))

  function mockComment(body: string, pending: boolean) {
    return {
      id: nextMockCommentId++,
      author: { login: viewerLogin },
      body,
      createdAt: new Date().toISOString(),
      pending,
    }
  }

  return reactive({
    threads,
    summaries,
    pendingReview,
    pendingCommentCount,
    isLoading: false,
    viewerLogin,
    canWrite: input.canWrite ?? true,
    writeBlockedReason: input.writeBlockedReason,
    showThreads,
    setShowThreads: (value: boolean) => { showThreads.value = value },
    load: async () => {},
    addComment: async (target: ReviewDraftTarget, body: string, mode: 'single' | 'review') => {
      if (mode === 'review' && !pendingReview.value)
        pendingReview.value = { id: 1, nodeId: 'PRR_mock', body: '' }
      threads.value = [...threads.value, {
        rootId: nextMockCommentId,
        path: target.path,
        side: target.side,
        line: target.line,
        startLine: target.startLine,
        startSide: target.startSide,
        outdated: false,
        pending: mode === 'review',
        comments: [mockComment(body, mode === 'review')],
      }]
    },
    reply: async (rootCommentId: number, body: string) => {
      threads.value = threads.value.map(thread => thread.rootId === rootCommentId
        ? { ...thread, comments: [...thread.comments, mockComment(body, false)] }
        : thread)
    },
    editComment: async (commentId: number, body: string) => {
      threads.value = threads.value.map(thread => ({
        ...thread,
        comments: thread.comments.map(comment => comment.id === commentId ? { ...comment, body } : comment),
      }))
    },
    deleteComment: async (commentId: number) => {
      threads.value = threads.value
        .map(thread => ({ ...thread, comments: thread.comments.filter(comment => comment.id !== commentId) }))
        .filter(thread => thread.comments.length > 0)
    },
    resolveThread: async (threadId: string) => {
      threads.value = threads.value.map(thread => thread.threadId === threadId ? { ...thread, resolved: true } : thread)
    },
    submitReview: async (_verdict: ReviewVerdict, _body: string) => {
      threads.value = threads.value.map(thread => ({
        ...thread,
        pending: false,
        comments: thread.comments.map(comment => ({ ...comment, pending: false })),
      }))
      pendingReview.value = undefined
    },
    discardPendingReview: async () => {
      threads.value = threads.value.filter(thread => !thread.pending)
      pendingReview.value = undefined
    },
  }) as DiffsStoreReviews
}

export interface MockSharedInput {
  candidates?: SharedAnalysisCandidate[]
  notice?: string
  canShare?: boolean
  isSharing?: boolean
  error?: Error
  ownComment?: { id: number, url: string }
  viewerLogin?: string
}

/** In-memory `DiffsStoreShared`: `load`/`share` only flip local state. */
export function createMockSharedStore(input: MockSharedInput, applyResult: (result: GroupedResult) => void): DiffsStoreShared {
  const candidates = ref(input.candidates ?? [])
  const notice = ref(input.notice)
  const ownComment = ref(input.ownComment)
  return reactive({
    candidates,
    notice,
    viewerLogin: input.viewerLogin ?? 'octocat',
    canShare: input.canShare ?? true,
    isSharing: input.isSharing ?? false,
    error: input.error,
    ownComment,
    dismiss: () => {
      candidates.value = []
      notice.value = undefined
    },
    load: async (login: string) => {
      const candidate = candidates.value.find(entry => entry.login === login)
      if (candidate)
        applyResult({ ...candidate.result, sharedBy: login })
      candidates.value = []
      notice.value = undefined
    },
    share: async () => {
      ownComment.value = { id: 1, url: 'https://github.com/owner/repo/pull/1#issuecomment-1' }
    },
  }) as DiffsStoreShared
}

/**
 * In-memory `DiffsStore` for Storybook stories and tests: same interface as
 * `createDiffsStore`, but never touches cache/network/providers/adapters. `load`/
 * `refresh` are no-ops since the data is already seeded; `reanalyze` just exposes the
 * seeded grouping as `aiResult` rather than calling the real `llm` adapter.
 */
export function createMockDiffsStore(input: {
  diff?: DiffsPayload
  grouped?: GroupedResult
  reviewed?: Iterable<string>
  /** Paths flagged as reviewed-then-changed (see `DiffsStore.changedSinceReviewed`). */
  changedSinceReviewed?: Iterable<string>
  isLoading?: boolean
  error?: Error
  isStale?: boolean
  isSetup?: boolean
  llm?: boolean
  isAnalyzing?: boolean
  llmProgress?: LlmProgress
  llmTranscript?: AgentMessage[]
  llmError?: Error
  chatMessages?: AgentMessage[]
  chatStreaming?: boolean
  chatError?: Error
  chatAvailable?: boolean
  layout?: 'split' | 'unified'
  /** Enables the reviews sub-store (absent = a source with no review lifecycle). */
  reviews?: MockReviewsInput
  /** Enables the shared-analysis sub-store (absent = a source with no PR comments). */
  shared?: MockSharedInput
  /** Enables "load full file": every file loads these contents (absent = a source that can't, like a paste). */
  fileContent?: { old?: string, new?: string }
}): DiffsStore {
  const llmEnabled = input.llm ?? true
  const { fileContent } = input

  const diff = ref(input.diff)
  const grouped = ref(input.grouped)
  const isLoading = ref(input.isLoading ?? false)
  const error = ref(input.error)
  const isStale = ref(input.isStale ?? false)
  const reviewed = ref(new Set(input.reviewed ?? []))
  const changedSinceReviewed = ref(new Set(input.changedSinceReviewed ?? []))
  const analyzeMode = ref<GroupSource>(grouped.value?.source ?? (llmEnabled ? 'llm' : 'rule-based'))
  const isAnalyzing = ref(input.isAnalyzing ?? false)
  const llmProgress = ref(input.llmProgress)
  const llmTranscript = shallowRef(input.llmTranscript ?? [])
  const llmError = ref(input.llmError)
  const hasAiResult = ref(grouped.value?.source === 'llm')
  const isSetup = computed(() => input.isSetup ?? true)
  const aiResult = computed(() => hasAiResult.value ? grouped.value : undefined)
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

  async function setReviewed(shas: string[], isReviewed: boolean) {
    const next = new Set(reviewed.value)
    for (const sha of shas)
      isReviewed ? next.add(sha) : next.delete(sha)
    reviewed.value = next
    const touched = new Set(shas)
    const remaining = new Set(changedSinceReviewed.value)
    for (const file of diff.value?.files ?? []) {
      if (touched.has(file.sha))
        remaining.delete(file.path)
    }
    changedSinceReviewed.value = remaining
  }

  async function setAnalyzeMode(mode: GroupSource) {
    analyzeMode.value = mode
  }

  async function reanalyze() {
    llmError.value = undefined
    hasAiResult.value = true
    analyzeMode.value = 'llm'
  }

  function abort() {
    isAnalyzing.value = false
    llmProgress.value = undefined
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
    llm: llmEnabled
      ? reactive({
          isSetup,
          isAnalyzing,
          progress: llmProgress,
          transcript: llmTranscript,
          error: llmError,
          reanalyze,
          abort,
          chat,
        })
      : undefined,
    reviews: input.reviews ? createMockReviewsStore(input.reviews) : undefined,
    shared: input.shared
      ? createMockSharedStore(input.shared, (result) => {
          grouped.value = result
          hasAiResult.value = true
          analyzeMode.value = result.source
        })
      : undefined,
    fileContent: fileContent && { load: async () => fileContent },
    load,
    refresh,
    setReviewed,
  }) as DiffsStore
}
