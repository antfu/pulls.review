import type { CommentAuthor, CommentThread, ReviewComment, ReviewData, ReviewSummary } from '../../types/comment-threads'
import type { GitlabUserJson } from './api'
import type { GitlabApprovalsJson, GitlabDiscussionJson, GitlabNoteJson } from './review-api'
import { parseSharedAnalysisBody } from '../shared-analysis-body'
import { fromGitlabPosition } from './position'

function normalizeAuthor(user: GitlabUserJson | null): CommentAuthor | undefined {
  return user ? { login: user.username, avatarUrl: user.avatar_url ?? undefined } : undefined
}

/**
 * Folds a merge request's discussions and approvals into the canonical `ReviewData`.
 * A discussion on a diff line becomes a thread, anchored in the diff whose head is
 * `headSha`. GitLab has no review object: an approval, and each comment on the merge
 * request as a whole, becomes a summary. Nothing is ever pending.
 */
export function normalizeReviewData(input: {
  discussions: GitlabDiscussionJson[]
  approvals: GitlabApprovalsJson
  headSha: string
  /** The merge request's page, which a note's permalink hangs off. */
  url: string
}): ReviewData {
  const toComment = (note: GitlabNoteJson): ReviewComment => ({
    id: note.id,
    author: normalizeAuthor(note.author),
    body: note.body,
    createdAt: note.created_at,
    url: `${input.url}#note_${note.id}`,
    pending: false,
  })

  const threads: CommentThread[] = []
  const comments: ReviewSummary[] = []
  for (const discussion of input.discussions) {
    const notes = discussion.notes.filter(note => !note.system)
    const [root] = notes
    if (!root)
      continue
    if (root.position) {
      const resolvable = notes.filter(note => note.resolvable)
      threads.push({
        rootId: root.id,
        ...fromGitlabPosition(root.position, input.headSha),
        resolved: resolvable.length > 0 && resolvable.every(note => note.resolved),
        threadId: discussion.id,
        pending: false,
        comments: notes.map(toComment),
      })
      continue
    }
    for (const note of notes) {
      // A shared analysis is data the view loads elsewhere, not a comment to read.
      if (parseSharedAnalysisBody(note.body))
        continue
      const { id, author, body, createdAt, url } = toComment(note)
      comments.push({ id, author, state: 'commented', body, submittedAt: createdAt, url })
    }
  }

  const approvals = input.approvals.approved_by.map(({ user, approved_at }): ReviewSummary => ({
    // An approval has no id of its own; a negated user id can't meet a note id in the same list.
    id: -user.id,
    author: normalizeAuthor(user),
    state: 'approved',
    body: '',
    submittedAt: approved_at,
  }))

  return { threads, summaries: [...approvals, ...comments], pendingReview: undefined }
}
