import type { CacheRepositories } from '@pulls.review/core/cache'
import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import type { GithubWriteAccess } from './github-write-access'
import type { DiffsStoreShared, SharedAnalysisCandidate } from './types'
import { createGithubClient, createIssueComment, fetchSharedAnalysisComments, GithubApiError, renderSharedAnalysisComment, updateIssueComment } from '@pulls.review/core/github'
import { reactive, ref } from 'vue'
import { t } from '../i18n'
import { localizeError } from '../i18n/core-messages'

export interface SharedAnalysisStoreOptions {
  cache: CacheRepositories
  token?: string
  access: GithubWriteAccess
  getDiff: () => DiffsPayload | undefined
  getCacheKey: () => string | undefined
  getAiResult: () => GroupedResult | undefined
  /** The viewer's own comment remembered on the PR cache entry, if any. */
  cachedComment: () => { id: number, url: string } | undefined
  /** Installs a loaded shared result (with `sharedBy` set) into the diff store and cache. */
  applyResult: (result: GroupedResult) => Promise<void>
}

/**
 * The github-only sub-store behind `DiffsStore.shared`. `discover` is called by
 * `createDiffsStore` after each diff load; `share`/`load`/`dismiss` by the view.
 */
export function createSharedAnalysisStore(pr: { owner: string, repo: string, number: string }, opts: SharedAnalysisStoreOptions) {
  const { access } = opts
  const client = createGithubClient(opts.token || undefined)

  const candidates = ref<SharedAnalysisCandidate[]>([])
  const notice = ref<string>()
  const isSharing = ref(false)
  const error = ref<Error>()
  const ownComment = ref<{ id: number, url: string }>()

  async function apply(candidate: SharedAnalysisCandidate) {
    await opts.applyResult({ ...candidate.result, sharedBy: candidate.login })
    candidates.value = []
    notice.value = undefined
  }

  /**
   * Scans the PR's comments for shared analyses. Without `from`, only when the
   * store holds no AI result yet (one request, best-effort). With `from`, always:
   * that user's result loads directly unless it would replace a locally generated one.
   */
  async function discover(from?: string) {
    await access.resolve()
    ownComment.value ??= opts.cachedComment()
    const current = opts.getAiResult()
    if (!from && current)
      return

    let found
    try {
      found = await fetchSharedAnalysisComments(client, pr)
    }
    catch {
      return
    }
    const viewer = access.viewerLogin.value
    const own = found.find(comment => comment.login === viewer)
    if (own)
      ownComment.value = { id: own.id, url: own.url }

    const headSha = opts.getDiff()?.head?.sha
    const toCandidate = (comment: typeof found[number]): SharedAnalysisCandidate => ({
      login: comment.login,
      url: comment.url,
      result: comment.analysis.result,
      own: comment.login === viewer,
      stale: comment.analysis.headSha !== headSha,
    })

    if (from) {
      const target = found.find(comment => comment.login === from)
      if (target) {
        const hasLocalResult = current !== undefined && current.sharedBy === undefined
        if (hasLocalResult)
          candidates.value = [toCandidate(target)]
        else
          await apply(toCandidate(target))
        return
      }
      notice.value = t('share.notShared', { login: from })
      if (current)
        return
    }
    candidates.value = found.map(toCandidate)
  }

  async function load(login: string) {
    const candidate = candidates.value.find(entry => entry.login === login)
    if (candidate)
      await apply(candidate)
  }

  function dismiss() {
    candidates.value = []
    notice.value = undefined
  }

  async function share() {
    const diff = opts.getDiff()
    const result = opts.getAiResult()
    if (!diff || !result || result.sharedBy)
      return
    isSharing.value = true
    error.value = undefined
    try {
      await access.write(async (writer) => {
        const login = access.viewerLogin.value
        if (!login)
          throw new Error(t('errors.noViewer'))
        const body = renderSharedAnalysisComment(pr, login, { headSha: diff.head?.sha ?? '', result })

        let comment = ownComment.value
        if (comment) {
          try {
            comment = await updateIssueComment(writer, pr, comment.id, body)
          }
          catch (err) {
            // The remembered comment was deleted on GitHub - fall through to the scan.
            if (!(err instanceof GithubApiError && err.status === 404))
              throw err
            comment = undefined
          }
        }
        if (!comment) {
          const existing = (await fetchSharedAnalysisComments(writer, pr)).find(entry => entry.login === login)
          comment = existing
            ? await updateIssueComment(writer, pr, existing.id, body)
            : await createIssueComment(writer, pr, body)
        }
        ownComment.value = comment
        const key = opts.getCacheKey()
        if (key)
          await opts.cache.diffs.setSharedComment(key, comment)
      })
    }
    catch (err) {
      error.value = localizeError(err)
    }
    finally {
      isSharing.value = false
    }
  }

  return {
    store: reactive({
      candidates,
      notice,
      viewerLogin: access.viewerLogin,
      canShare: access.canWrite,
      isSharing,
      error,
      ownComment,
      dismiss,
      load,
      share,
    }) as DiffsStoreShared,
    discover,
  }
}
