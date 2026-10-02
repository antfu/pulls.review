import type { DiffsPayload } from './diff'
import * as v from 'valibot'

/** Identifies one diff, whatever produced it. Persisted on `DiffsPayload.ref`. */
export const SourceRefSchema = v.variant('kind', [
  v.object({ kind: v.literal('github-pr'), owner: v.string(), repo: v.string(), number: v.string() }),
  v.object({ kind: v.literal('paste'), hash: v.string() }),
])
export type SourceRef = v.InferOutput<typeof SourceRefSchema>

/** The cache key for a ref - the only place a key is derived. */
export function serializeRef(ref: SourceRef): string {
  switch (ref.kind) {
    case 'github-pr':
      return `github:${ref.owner}/${ref.repo}#${ref.number}`
    case 'paste':
      return `paste:${ref.hash}`
  }
}

/** Secrets a source may need, read on every use so a token saved later applies at once. */
export interface Credentials {
  githubToken: () => Promise<string | undefined>
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
  /**
   * The GitHub PR behind this diff, for its review threads and shared analyses.
   * Replaced by review/sharing capability APIs (plans/10, step 7).
   */
  githubPullRequest?: { owner: string, repo: string, number: string }
}
