import type { ReviewData, ReviewDraftTarget, ReviewVerdict } from '../types/comment-threads'
import type { DiffsStoreReviews } from './types'
import { computed, reactive, ref } from 'vue'
import { setReviewData } from '../cache/pr-cache'
import { getDefaultCacheStorage } from '../cache/storage'
import { resolveStoredTokenMeta } from '../composables/useGithubTokenMeta'
import { GithubApiError } from '../providers/github/api'
import {
  createPendingReview,
  createReview,
  createReviewComment,
  deletePendingReview,
  deleteReviewComment,
  fetchReviewComments,
  fetchReviewCommentsForReview,
  fetchReviews,
  replyToReviewComment,
  submitPendingReview,
  updateReviewComment,
} from '../providers/github/review-api'
import { addThreadToPendingReview, fetchThreadResolutions, resolveThread as resolveThreadMutation } from '../providers/github/review-graphql'
import { normalizeReviewData } from '../providers/github/review-normalize'
import { showReviewComments } from '../state/review-comments'

export interface ReviewsStoreOptions {
  token?: string
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

  const data = ref<ReviewData>({ threads: [], summaries: [], pendingReview: undefined })
  const isLoading = ref(false)
  const viewerLogin = ref<string>()
  const scopesAllowWrite = ref(false)
  const writeBlockedReason = ref<string>()

  const canWrite = computed(() => !!token && scopesAllowWrite.value && !writeBlockedReason.value)
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
      if (token) {
        const meta = await resolveStoredTokenMeta(token)
        viewerLogin.value = meta?.login
        // No scopes header = fine-grained token: optimistic until a 403 says otherwise.
        scopesAllowWrite.value = meta !== undefined
          && (meta.scopes.length === 0 || meta.scopes.includes('repo') || meta.scopes.includes('public_repo'))
      }
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

  /** Wraps every write: a 403 means the token can't write here - flip the session read-only. */
  async function write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    }
    catch (err) {
      if (err instanceof GithubApiError && err.status === 403)
        writeBlockedReason.value = 'This token cannot write reviews on this repository. It needs the "repo" scope (classic token) or "Pull requests: Read and write" permission (fine-grained token).'
      throw err
    }
  }

  function requireToken(): string {
    if (!token)
      throw new Error('A GitHub token is required to leave reviews.')
    return token
  }

  async function addComment(target: ReviewDraftTarget, body: string, mode: 'single' | 'review') {
    const auth = requireToken()
    await write(async () => {
      if (mode === 'review' && data.value.pendingReview) {
        await addThreadToPendingReview(data.value.pendingReview.nodeId, target, body, auth)
        return
      }
      const headSha = opts.getHeadSha()
      if (!headSha)
        throw new Error('The diff has not finished loading yet.')
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
    await write(() => replyToReviewComment(owner, repo, number, rootCommentId, body, requireToken()))
    await refetch()
  }

  async function editComment(commentId: number, body: string) {
    await write(() => updateReviewComment(owner, repo, commentId, body, requireToken()))
    await refetch()
  }

  async function deleteComment(commentId: number) {
    await write(() => deleteReviewComment(owner, repo, commentId, requireToken()))
    await refetch()
  }

  async function resolveThread(threadId: string) {
    await write(() => resolveThreadMutation(threadId, requireToken()))
    await refetch()
  }

  async function submitReview(verdict: ReviewVerdict, body: string) {
    const auth = requireToken()
    await write(async () => {
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
    await write(() => deletePendingReview(owner, repo, number, pending.id, requireToken()))
    await refetch()
  }

  return reactive({
    threads: computed(() => data.value.threads),
    summaries: computed(() => data.value.summaries),
    pendingReview: computed(() => data.value.pendingReview),
    pendingCommentCount,
    isLoading,
    viewerLogin,
    canWrite,
    writeBlockedReason,
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
