import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ResolvedGroupWithChildren } from '../components/diff/group-utils'
import type { AnalyzeProgress, GroupedResult, GroupSource } from '../types/analyze'
import type { CommentThread, PendingReview, ReviewDraftTarget, ReviewSummary, ReviewVerdict } from '../types/comment-threads'
import type { DiffsPayload } from '../types/diff'

/**
 * LLM-specific analysis operations, isolated behind `DiffsStore.llm` so components can
 * gate the whole "AI" affordance on its presence rather than a separate boolean prop.
 * Owns operations only, not settings CRUD - API keys live in the app-wide
 * `settings.value.llm` singleton (`app/state/settings.ts`), edited by `SettingsPanel.vue`
 * independently of any one diff view.
 *
 * Built with `reactive()` (see `createDiffsStore`/`createMockDiffsStore`), like a Pinia
 * store - fields read directly (`store.llm.isSetup`), no `.value`.
 */
export interface DiffsStoreLlm {
  /** Whether a gateway token or vendor API key is configured (was `llmAvailable`). */
  readonly isSetup: boolean
  readonly isAnalyzing: boolean
  readonly progress: AnalyzeProgress | undefined
  readonly error: Error | undefined
  /** Whether the `llm` adapter has already produced a result for the current diff. */
  readonly hasAiResult: boolean
  readonly analyzeMode: GroupSource
  /** Switches the active grouping. `none`/`rule-based` analyze immediately (free, instant); `llm` only switches the view - call `reanalyze` to actually run it. */
  setAnalyzeMode: (mode: GroupSource) => Promise<void>
  reanalyze: () => Promise<void>
  readonly chat: {
    readonly available: boolean
    readonly messages: AgentMessage[]
    readonly isStreaming: boolean
    readonly error: Error | undefined
    send: (text: string) => Promise<void>
    retry: () => Promise<void>
    stop: () => void
    clear: () => Promise<void>
  }
}

/**
 * GitHub PR review threads and review submission, isolated behind `DiffsStore.reviews`
 * the same way LLM analysis sits behind `DiffsStore.llm`: components gate the whole
 * review affordance on its presence (`undefined` = the source has no review lifecycle -
 * paste, or `supportsComments: false`). Mutations post directly browser -> GitHub with
 * the user's own PAT; every mutation refetches so the view always reflects GitHub.
 */
export interface DiffsStoreReviews {
  readonly threads: CommentThread[]
  readonly summaries: ReviewSummary[]
  /** The viewer's unsubmitted review; new comments attach to it while it exists. */
  readonly pendingReview: PendingReview | undefined
  readonly pendingCommentCount: number
  readonly isLoading: boolean
  /** Login of the token's user - gates edit/delete to own comments. */
  readonly viewerLogin: string | undefined
  /**
   * Whether write UI shows at all. Classic PATs are gated on their scopes
   * (`repo`/`public_repo`); fine-grained PATs expose no scopes, so they start
   * optimistic and flip off on the first 403 (see `writeBlockedReason`).
   */
  readonly canWrite: boolean
  /** Set when a write got a 403 - explains why write UI disappeared mid-session. */
  readonly writeBlockedReason: string | undefined
  /** Global persisted toggle: render existing (submitted) threads inline. Pending drafts always render. */
  readonly showThreads: boolean
  setShowThreads: (value: boolean) => void
  load: () => Promise<void>
  /** `single` posts immediately; `review` starts (or adds to) the pending review. */
  addComment: (target: ReviewDraftTarget, body: string, mode: 'single' | 'review') => Promise<void>
  reply: (rootCommentId: number, body: string) => Promise<void>
  editComment: (commentId: number, body: string) => Promise<void>
  deleteComment: (commentId: number) => Promise<void>
  resolveThread: (threadId: string) => Promise<void>
  submitReview: (verdict: ReviewVerdict, body: string) => Promise<void>
  discardPendingReview: () => Promise<void>
}

/**
 * Presentation-level settings every diff view component needs, grouped so they can be
 * read off the same `store` prop instead of threaded down as their own separate props.
 * `layout` is a shared app-wide preference (backed by the same persisted singleton
 * across every `DiffsStore` instance, like `state/dark.ts`'s `isDark`) - writing it
 * through one store's `ui.layout` updates it everywhere. `isEmbedded` is fixed per
 * store instance (set at creation) - the GitHub-embedded view is the one place it's
 * `true`.
 */
export interface DiffsStoreUi {
  readonly layout: 'split' | 'unified'
  readonly isEmbedded: boolean
  setLayout: (layout: 'split' | 'unified') => void
}

/**
 * One reactive store per loaded diff - created explicitly by `createDiffsStore` (real
 * data) or `createMockDiffsStore` (Storybook/tests), never a global singleton/registry.
 * Passed down as a single prop through the whole view tree; components call its methods
 * directly instead of emitting events that bubble back up to whoever created it.
 *
 * Built with `reactive()`, like a Pinia store - state fields read directly
 * (`store.diff`, `store.reviewed`), never as raw `Ref`s needing `.value`. That also
 * keeps it safe to pass through contexts that wrap values in their own `reactive()`
 * (e.g. Storybook args) without double-unwrapping.
 */
export interface DiffsStore {
  readonly diff: DiffsPayload | undefined
  readonly grouped: GroupedResult | undefined
  readonly isLoading: boolean
  readonly error: Error | undefined
  /** Only meaningful once `diff`/`grouped` are loaded - a source with no live origin (paste) just never sets this. */
  readonly isStale: boolean
  readonly reviewed: Set<string>
  /** Each group's `filePaths` resolved into real `FileChange`s, `[]` until `diff`/`grouped` are both loaded. */
  readonly groups: ResolvedGroupWithChildren[]
  readonly ui: DiffsStoreUi
  /** `undefined` = LLM analysis isn't available in this environment (embed, or disabled). */
  readonly llm?: DiffsStoreLlm
  /** `undefined` = this source has no review threads (paste/local, or capability off). */
  readonly reviews?: DiffsStoreReviews
  load: () => Promise<void>
  refresh: () => Promise<void>
  toggleReviewed: (sha: string, reviewed: boolean) => Promise<void>
}
