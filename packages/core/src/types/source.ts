import type { ReviewData, ReviewDraftTarget, ReviewVerdict } from './comment-threads'
import type { DiffsPayload } from './diff'
import type { SharedAnalysis, SharedAnalysisComment } from './shared-analysis'
import * as v from 'valibot'

/** Identifies one diff, whatever produced it. Persisted on `DiffsPayload.ref`. */
export const SourceRefSchema = v.variant('kind', [
  v.object({ kind: v.literal('github-pr'), owner: v.string(), repo: v.string(), number: v.string() }),
  /** What `head` adds since it forked from `base` (`base...head`); either may be a branch, tag or sha. */
  v.object({ kind: v.literal('github-compare'), owner: v.string(), repo: v.string(), base: v.string(), head: v.string() }),
  v.object({ kind: v.literal('github-commit'), owner: v.string(), repo: v.string(), sha: v.string() }),
  /** `host` is the instance (`gitlab.com`), `project` its full path with every namespace (`group/subgroup/project`). */
  v.object({ kind: v.literal('gitlab-mr'), host: v.string(), project: v.string(), iid: v.string() }),
  v.object({ kind: v.literal('paste'), hash: v.string() }),
  /** A local repository (its root path) at a target in git revision syntax; `''` is the working tree. */
  v.object({ kind: v.literal('local'), repo: v.string(), target: v.string() }),
])
export type SourceRef = v.InferOutput<typeof SourceRefSchema>

/** The cache key for a ref - the only place a key is derived. */
export function serializeRef(ref: SourceRef): string {
  switch (ref.kind) {
    case 'github-pr':
      return `github:${ref.owner}/${ref.repo}#${ref.number}`
    case 'github-compare':
      return `github:${ref.owner}/${ref.repo}@${ref.base}...${ref.head}`
    case 'github-commit':
      return `github:${ref.owner}/${ref.repo}@${ref.sha}`
    case 'gitlab-mr':
      // A host has no `/` and a project path no `!`, so the three parts can't run into each other.
      return `gitlab:${ref.host}/${ref.project}!${ref.iid}`
    case 'paste':
      return `paste:${ref.hash}`
    case 'local':
      // Both parts are free text (paths, `a...b`): escaped so no two refs normalize to one storage key.
      return `local:${encodeURIComponent(ref.repo)}@${encodeURIComponent(ref.target)}`
  }
}

/** Secrets a source may need, read on every use so a token saved later applies at once. */
export interface Credentials {
  githubToken: () => Promise<string | undefined>
  /** The token for one GitLab instance; a token is never offered to a host it wasn't saved for. */
  gitlabToken?: (host: string) => Promise<string | undefined>
}

export function staticCredentials(githubToken?: string): Credentials {
  return { githubToken: async () => githubToken }
}

/**
 * One diff's origin, bound to its target and credentials. Optional members are
 * capabilities: a source without `fingerprint` is never checked for staleness.
 */
export interface DiffSource {
  /** Cache key, known before fetching (a paste hashes its text). */
  key: () => Promise<string>
  fetch: () => Promise<DiffsPayload>
  /** Cheap probe compared against the cached diff's head sha to detect new commits. */
  fingerprint?: () => Promise<string>
  /** A file's full content at one of the diff's `base`/`head` shas; `undefined` when the file doesn't exist there. */
  loadFile?: (path: string, sha: string) => Promise<string | undefined>
  /** Who the credentials act as, and whether they may write back; `undefined` when anonymous. */
  viewer?: () => Promise<Viewer | undefined>
  reviews?: ReviewsApi
  sharing?: SharingApi
  /** The credential a failed load can be retried with, so the view can offer to enter it. */
  auth?: 'github-token' | 'gitlab-token'
}

export interface Viewer {
  login: string
  /** What the credentials claim; a write can still be refused (`writeForbidden`). */
  canWrite: boolean
}

/**
 * Review threads and review submission for a diff that has a review lifecycle.
 * Writes throw the `writeForbidden` diagnostic when the credentials may not write here.
 */
export interface ReviewsApi {
  /** What the source's review model has; the view offers only what is `true`. */
  supports: {
    /** Draft comments held back until the review is submitted. */
    pendingReview: boolean
    requestChanges: boolean
  }
  fetch: () => Promise<ReviewData>
  /** `single` posts at once; `review` starts the viewer's pending review, or adds to `pendingReview` when given. */
  addComment: (input: { target: ReviewDraftTarget, body: string, mode: 'single' | 'review', headSha: string, pendingReview?: { nodeId: string } }) => Promise<void>
  reply: (rootCommentId: number, body: string) => Promise<void>
  editComment: (commentId: number, body: string) => Promise<void>
  deleteComment: (commentId: number) => Promise<void>
  resolveThread: (threadId: string) => Promise<void>
  /** Reopens a resolved thread, where the source can. */
  unresolveThread?: (threadId: string) => Promise<void>
  /** Submits `pendingReview` when given, else a review with no draft comments. */
  submitReview: (verdict: ReviewVerdict, body: string, pendingReview?: { id: number }) => Promise<void>
  discardPendingReview: (pendingReview: { id: number }) => Promise<void>
  /** Withdraws the viewer's approval, where the source can. */
  revokeApproval?: () => Promise<void>
}

/** Shared AI analyses posted alongside a diff, one per user (see plans/07). */
export interface SharingApi {
  /** Newest first; best-effort, one request. */
  list: () => Promise<SharedAnalysisComment[]>
  /** Posts or updates `login`'s comment; `remembered` is the comment a previous share returned. */
  upsert: (login: string, analysis: SharedAnalysis, remembered?: { id: number }) => Promise<{ id: number, url: string }>
}
