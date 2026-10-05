import type { CacheRepositories } from '@pulls.review/core/cache'
import type { ReviewData, ReviewDraftTarget, ReviewsApi, ReviewVerdict } from '@pulls.review/core/types'
import type { DiffsStoreReviews } from './types'
import type { WriteAccess } from './write-access'
import { computed, reactive, ref } from 'vue'
import { t } from '../i18n'
import { showReviewComments } from '../state/review-comments'

export interface ReviewsStoreOptions {
  cache: CacheRepositories
  access: WriteAccess
  /** Head sha of the loaded diff - `commit_id` for new comments; unset until the diff loads. */
  getHeadSha: () => string | undefined
  /** PR cache key of the loaded diff, for persisting the SWR snapshot; unset until the diff loads. */
  getCacheKey: () => string | undefined
  /** SWR seed from the PR cache entry, shown until the fresh fetch lands. */
  cachedData?: () => ReviewData | undefined
}

/**
 * The review sub-store behind `DiffsStore.reviews` - same `reactive()` construction as
 * `createDiffsStore`, created by it for a source that has a review lifecycle
 * (`DiffSource.reviews`).
 */
export function createReviewsStore(api: ReviewsApi, opts: ReviewsStoreOptions): DiffsStoreReviews {
  const { write } = opts.access

  const data = ref<ReviewData>({ threads: [], summaries: [], pendingReview: undefined })
  const isLoading = ref(false)
  const pendingCommentCount = computed(() =>
    data.value.threads.reduce((count, thread) => count + thread.comments.filter(comment => comment.pending).length, 0))

  async function refetch() {
    const fresh = await api.fetch()
    data.value = fresh
    const key = opts.getCacheKey()
    if (key)
      await opts.cache.diffs.setReviewData(key, fresh)
  }

  async function load() {
    const cached = opts.cachedData?.()
    if (cached)
      data.value = cached
    isLoading.value = !cached
    try {
      await opts.access.resolve()
      await refetch()
    }
    catch {
      // Non-fatal: the diff view renders fine without threads (e.g. rate-limited
      // anonymous fetch); a cached snapshot, when present, stays on screen.
    }
    finally {
      isLoading.value = false
    }
  }

  /** Every mutation refetches, so the view always reflects the source. */
  async function mutate(action: () => Promise<void>) {
    await write(action)
    await refetch()
  }

  async function addComment(target: ReviewDraftTarget, body: string, mode: 'single' | 'review') {
    const headSha = opts.getHeadSha()
    if (!headSha)
      throw new Error(t('errors.diffNotLoaded'))
    await mutate(() => api.addComment({ target, body, mode, headSha, pendingReview: data.value.pendingReview }))
  }

  async function discardPendingReview() {
    const pending = data.value.pendingReview
    if (pending)
      await mutate(() => api.discardPendingReview(pending))
  }

  return reactive({
    threads: computed(() => data.value.threads),
    summaries: computed(() => data.value.summaries),
    pendingReview: computed(() => data.value.pendingReview),
    pendingCommentCount,
    isLoading,
    viewerLogin: opts.access.viewerLogin,
    canWrite: opts.access.canWrite,
    writeBlockedReason: opts.access.writeBlockedReason,
    showThreads: showReviewComments,
    setShowThreads: (value: boolean) => { showReviewComments.value = value },
    load,
    addComment,
    reply: (rootCommentId: number, body: string) => mutate(() => api.reply(rootCommentId, body)),
    editComment: (commentId: number, body: string) => mutate(() => api.editComment(commentId, body)),
    deleteComment: (commentId: number) => mutate(() => api.deleteComment(commentId)),
    resolveThread: (threadId: string) => mutate(() => api.resolveThread(threadId)),
    submitReview: (verdict: ReviewVerdict, body: string) => mutate(() => api.submitReview(verdict, body, data.value.pendingReview)),
    discardPendingReview,
  }) as DiffsStoreReviews
}
