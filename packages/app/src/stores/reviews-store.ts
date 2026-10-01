import type { ReviewData, ReviewDraftTarget, ReviewVerdict } from '@pulls.review/core'
import type { GithubWriteAccess } from './github-write-access'
import type { DiffsStoreReviews } from './types'
import {
  addThreadToPendingReview,
  createPendingReview,
  createReview,
  createReviewComment,
  deletePendingReview,
  deleteReviewComment,
  fetchReviewComments,
  fetchReviewCommentsForReview,
  fetchReviews,
  fetchThreadResolutions,
  normalizeReviewData,
  replyToReviewComment,
  resolveThread as resolveThreadMutation,
  submitPendingReview,
  updateReviewComment,
} from '@pulls.review/core'
import { computed, reactive, ref } from 'vue'
import { setReviewData } from '../cache/pr-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { t } from '../i18n'
import { showReviewComments } from '../state/review-comments'

export interface ReviewsStoreOptions {
  token?: string
  access: GithubWriteAccess
  /** Head sha of the loaded diff - `commit_id` for new comments; unset until the diff loads. */
  getHeadSha: () => string | undefined
  /** PR cache key of the loaded diff, for persisting the SWR snapshot; unset until the diff loads. */
  getCacheKey: () => string | undefined
  /** SWR seed from the PR cache entry, shown until the fresh fetch lands. */
  cachedData?: () => ReviewData | undefined
}

function toGithubSide(side: 'additions' | 'deletions'): 'LEFT' | 'RIGHT' {
  return side === 'additions' ? 'RIGHT' : 'LEFT'
}

/**
 * The github-only review sub-store behind `DiffsStore.reviews` - same
 * `reactive()` construction as `createDiffsStore`, created by it for
 * `github-pr` params when the provider's `supportsComments` capability is on.
 */
export function createReviewsStore(params: { owner: string, repo: string, number: string }, opts: ReviewsStoreOptions): DiffsStoreReviews {
  const { owner, repo, number } = params
  const token = opts.token || undefined
  const { write } = opts.access

  const data = ref<ReviewData>({ threads: [], summaries: [], pendingReview: undefined })
  const isLoading = ref(false)
  const pendingCommentCount = computed(() =>
    data.value.threads.reduce((count, thread) => count + thread.comments.filter(comment => comment.pending).length, 0))

  async function fetchFresh(): Promise<ReviewData> {
    const [comments, reviews] = await Promise.all([
      fetchReviewComments(owner, repo, number, token),
      fetchReviews(owner, repo, number, token),
    ])
    const pending = reviews.find(review => review.state === 'PENDING')
    const [pendingComments, resolutions] = await Promise.all([
      pending ? fetchReviewCommentsForReview(owner, repo, number, pending.id, token) : Promise.resolve([]),
      // Resolution lives in GraphQL only, which needs a token - degrade to
      // "resolution unknown" silently for anonymous viewers or on failure.
      token ? fetchThreadResolutions(owner, repo, number, token).catch(() => undefined) : Promise.resolve(undefined),
    ])
    return normalizeReviewData({ comments, reviews, pendingComments, resolutions })
  }

  async function refetch() {
    const fresh = await fetchFresh()
    data.value = fresh
    const key = opts.getCacheKey()
    if (key) {
      const storage = await getDefaultCacheStorage()
      await setReviewData(storage, key, fresh)
    }
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

  async function addComment(target: ReviewDraftTarget, body: string, mode: 'single' | 'review') {
    await write(async (auth) => {
      if (mode === 'review' && data.value.pendingReview) {
        await addThreadToPendingReview(data.value.pendingReview.nodeId, target, body, auth)
        return
      }
      const headSha = opts.getHeadSha()
      if (!headSha)
        throw new Error(t('errors.diffNotLoaded'))
      const input = {
        body,
        commitId: headSha,
        path: target.path,
        side: toGithubSide(target.side),
        line: target.line,
        startLine: target.startLine,
        startSide: target.startSide ? toGithubSide(target.startSide) : undefined,
      }
      if (mode === 'review')
        await createPendingReview(owner, repo, number, input, auth)
      else
        await createReviewComment(owner, repo, number, input, auth)
    })
    await refetch()
  }

  async function reply(rootCommentId: number, body: string) {
    await write(auth => replyToReviewComment(owner, repo, number, rootCommentId, body, auth))
    await refetch()
  }

  async function editComment(commentId: number, body: string) {
    await write(auth => updateReviewComment(owner, repo, commentId, body, auth))
    await refetch()
  }

  async function deleteComment(commentId: number) {
    await write(auth => deleteReviewComment(owner, repo, commentId, auth))
    await refetch()
  }

  async function resolveThread(threadId: string) {
    await write(auth => resolveThreadMutation(threadId, auth))
    await refetch()
  }

  async function submitReview(verdict: ReviewVerdict, body: string) {
    await write(async (auth) => {
      const pending = data.value.pendingReview
      if (pending)
        await submitPendingReview(owner, repo, number, pending.id, verdict, body, auth)
      else
        await createReview(owner, repo, number, verdict, body, auth)
    })
    await refetch()
  }

  async function discardPendingReview() {
    const pending = data.value.pendingReview
    if (!pending)
      return
    await write(auth => deletePendingReview(owner, repo, number, pending.id, auth))
    await refetch()
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
    reply,
    editComment,
    deleteComment,
    resolveThread,
    submitReview,
    discardPendingReview,
  }) as DiffsStoreReviews
}
