import type { ReviewsApi } from '../../types/source'
import type { MergeRequestRef } from './api'
import type { GitlabClient } from './client'
import type { DiffVersion } from './position'
import { fetchMergeRequest, mergeRequestUrl } from './api'
import { toGitlabPosition } from './position'
import { approve, createDiffDiscussion, createNote, deleteNote, fetchApprovals, fetchDiscussions, replyToDiscussion, setDiscussionResolved, unapprove, updateNote } from './review-api'
import { normalizeReviewData } from './review-normalize'
import { asWrite } from './writes'

/**
 * GitLab has no review object to submit. A comment posts at once, approving is its
 * own action, and a review's summary is a comment on the merge request. Draft notes
 * and requesting changes are not offered (see `supports`).
 *
 * `versionAt` returns the diff version whose head is the given sha, and throws when
 * the merge request has moved past it.
 */
export function createGitlabReviewsApi(client: GitlabClient, mr: MergeRequestRef, versionAt: (headSha: string) => Promise<DiffVersion>): ReviewsApi {
  /** The contract replies by root comment id; GitLab replies to the discussion holding it. */
  let discussionIds = new Map<number, string>()

  async function fetch() {
    const [discussions, approvals, { diff_refs, sha }] = await Promise.all([
      fetchDiscussions(client, mr),
      fetchApprovals(client, mr),
      fetchMergeRequest(client, mr),
    ])
    const data = normalizeReviewData({ discussions, approvals, headSha: diff_refs?.head_sha ?? sha ?? '', url: mergeRequestUrl(client.host, mr) })
    discussionIds = new Map(data.threads.map(thread => [thread.rootId, thread.threadId!]))
    return data
  }

  async function discussionOf(rootCommentId: number): Promise<string> {
    if (!discussionIds.has(rootCommentId))
      await fetch()
    const id = discussionIds.get(rootCommentId)
    if (!id)
      throw new Error(`No discussion starts with note ${rootCommentId}`)
    return id
  }

  return {
    supports: { pendingReview: false, requestChanges: false },
    fetch,
    addComment: ({ target, body, headSha }) => asWrite(async () =>
      createDiffDiscussion(client, mr, body, await toGitlabPosition(await versionAt(headSha), target))),
    reply: (rootCommentId, body) => asWrite(async () => replyToDiscussion(client, mr, await discussionOf(rootCommentId), body)),
    editComment: (commentId, body) => asWrite(async () => {
      await updateNote(client, mr, commentId, body)
    }),
    deleteComment: commentId => asWrite(() => deleteNote(client, mr, commentId)),
    resolveThread: threadId => asWrite(() => setDiscussionResolved(client, mr, threadId, true)),
    unresolveThread: threadId => asWrite(() => setDiscussionResolved(client, mr, threadId, false)),
    submitReview: (verdict, body) => asWrite(async () => {
      // Approving first: a refused approval must not leave its summary behind as a stray comment.
      if (verdict === 'APPROVE')
        await approve(client, mr)
      if (body.trim())
        await createNote(client, mr, body)
    }),
    // Nothing is ever pending, so there is nothing to discard.
    discardPendingReview: async () => {},
    revokeApproval: () => asWrite(() => unapprove(client, mr)),
  }
}
