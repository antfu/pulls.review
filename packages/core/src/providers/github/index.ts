import type { Credentials, DiffSource } from '../../types/source'
import type { GithubTokenMeta } from './token-meta'
import { serializeRef } from '../../types/source'
import { fetchFileContentAtRef, fetchPullRequest, fetchPullRequestCommits, fetchPullRequestDiffText, fetchPullRequestFiles } from './api'
import { createGithubClient } from './client'
import { normalizePullRequest } from './normalize'
import { createGithubReviewsApi } from './reviews'
import { createGithubSharingApi } from './sharing'
import { fetchGithubTokenMeta } from './token-meta'

export interface GithubSourceOptions {
  /** Looks up who a token is; the app passes a cached lookup so a page load costs no `/user` call. */
  tokenMeta?: (token: string) => Promise<Pick<GithubTokenMeta, 'login' | 'scopes'> | undefined>
}

/** Classic PATs are gated on their scopes; fine-grained PATs expose none, so they start optimistic. */
function scopesAllowWrite(scopes: string[]): boolean {
  return scopes.length === 0 || scopes.includes('repo') || scopes.includes('public_repo')
}

/** A GitHub PR offers every capability a source can. */
export type GithubPullRequestSource = DiffSource & Required<Pick<DiffSource, 'fingerprint' | 'loadFile' | 'viewer' | 'reviews' | 'sharing'>>

export function createGithubPullRequestSource({ owner, repo, number }: { owner: string, repo: string, number: string }, credentials?: Credentials, { tokenMeta = fetchGithubTokenMeta }: GithubSourceOptions = {}): GithubPullRequestSource {
  const client = createGithubClient(credentials)
  const key = serializeRef({ kind: 'github-pr', owner, repo, number })
  return {
    key: async () => key,
    async fetch() {
      const [pr, files, commits] = await Promise.all([
        fetchPullRequest(client, owner, repo, number),
        fetchPullRequestFiles(client, owner, repo, number),
        fetchPullRequestCommits(client, owner, repo, number),
      ])
      return normalizePullRequest(owner, repo, number, pr, files, commits, {
        loadDiffText: () => fetchPullRequestDiffText(client, owner, repo, number),
        loadFileContent: (path, ref) => fetchFileContentAtRef(client, owner, repo, path, ref),
      })
    },
    fingerprint: async () => (await fetchPullRequest(client, owner, repo, number)).head.sha,
    loadFile: (path, sha) => fetchFileContentAtRef(client, owner, repo, path, sha),
    async viewer() {
      const token = await client.token()
      const meta = token ? await tokenMeta(token) : undefined
      return meta && { login: meta.login, canWrite: scopesAllowWrite(meta.scopes) }
    },
    reviews: createGithubReviewsApi(client, { owner, repo, number }),
    sharing: createGithubSharingApi(client, { owner, repo, number }),
    auth: 'github-token',
  }
}
