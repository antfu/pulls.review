import type { DiffsPayload } from '../../types/diff'
import type { Credentials, DiffSource } from '../../types/source'
import type { MergeRequestRef } from './api'
import type { DiffVersion } from './position'
import type { GitlabTokenMeta } from './token-meta'
import { diagnostics } from '../../diagnostics'
import { serializeRef } from '../../types/source'
import { fetchFileContentAtRef, fetchMergeRequest, fetchMergeRequestCommits, fetchMergeRequestDiffs, fetchRawDiff } from './api'
import { createGitlabClient } from './client'
import { normalizeMergeRequest } from './normalize'
import { createGitlabReviewsApi } from './reviews'
import { createGitlabSharingApi } from './sharing'
import { fetchGitlabTokenMeta } from './token-meta'

export interface GitlabSourceOptions {
  /** Looks up who a token is; the app passes a cached lookup so a page load costs no `/user` call. */
  tokenMeta?: (host: string, token: string) => Promise<Pick<GitlabTokenMeta, 'login' | 'scopes'> | undefined>
}

/** Every write needs `api`. A token that won't list its scopes starts optimistic. */
function scopesAllowWrite(scopes: string[]): boolean {
  return scopes.length === 0 || scopes.includes('api')
}

/** A GitLab merge request offers every capability a source can. */
export type GitlabMergeRequestSource = DiffSource & Required<Pick<DiffSource, 'fingerprint' | 'loadFile' | 'viewer' | 'reviews' | 'sharing'>>

export function createGitlabMergeRequestSource({ host, project, iid }: { host: string, project: string, iid: string }, credentials?: Credentials, { tokenMeta = fetchGitlabTokenMeta }: GitlabSourceOptions = {}): GitlabMergeRequestSource {
  const client = createGitlabClient(host, credentials)
  const mr: MergeRequestRef = { project, iid }
  const key = serializeRef({ kind: 'gitlab-mr', host, project, iid })
  /** The last diff fetched, kept to place comments on. */
  let latest: DiffVersion | undefined

  async function fetch(): Promise<DiffsPayload> {
    const [details, diffs, commits, rawDiff] = await Promise.all([
      fetchMergeRequest(client, mr),
      fetchMergeRequestDiffs(client, mr),
      fetchMergeRequestCommits(client, mr),
      fetchRawDiff(client, mr),
    ])
    const payload = await normalizeMergeRequest(host, mr, details, diffs, commits, rawDiff)
    latest = details.diff_refs
      ? { baseSha: details.diff_refs.base_sha, startSha: details.diff_refs.start_sha, headSha: details.diff_refs.head_sha, files: payload.files }
      : undefined
    return payload
  }

  /**
   * The view may hold a diff this source never fetched (it came from the cache), and
   * the merge request may have moved since. A comment is only placed on the version
   * the reviewer is looking at.
   */
  async function versionAt(headSha: string): Promise<DiffVersion> {
    if (latest?.headSha !== headSha)
      await fetch()
    if (latest?.headSha !== headSha)
      throw diagnostics.diffOutdated()
    return latest
  }

  return {
    key: async () => key,
    fetch,
    async fingerprint() {
      const { diff_refs, sha } = await fetchMergeRequest(client, mr)
      return diff_refs?.head_sha ?? sha ?? ''
    },
    loadFile: (path, sha) => fetchFileContentAtRef(client, project, path, sha),
    async viewer() {
      const token = await client.token()
      const meta = token ? await tokenMeta(host, token) : undefined
      return meta && { login: meta.login, canWrite: scopesAllowWrite(meta.scopes) }
    },
    reviews: createGitlabReviewsApi(client, mr, versionAt),
    sharing: createGitlabSharingApi(client, mr),
    auth: 'gitlab-token',
  }
}
