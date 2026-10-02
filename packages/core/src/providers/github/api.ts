import type { GithubClient } from './client'
import { GithubApiError } from './client'

export interface GithubPullRequestJson {
  title: string
  body: string | null
  user: { login: string } | null
  base: { ref: string, sha: string }
  head: { ref: string, sha: string }
  created_at: string
  updated_at: string
  html_url: string
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
}

export interface GithubPullRequestFileJson {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  sha: string
  patch?: string
}

export interface GithubPullRequestCommitJson {
  sha: string
  commit: { message: string }
}

export async function fetchPullRequest(client: GithubClient, owner: string, repo: string, number: string): Promise<GithubPullRequestJson> {
  return (await client.request(`/repos/${owner}/${repo}/pulls/${number}`)).json()
}

/** GitHub caps this endpoint at 3000 files total across pages. */
export function fetchPullRequestFiles(client: GithubClient, owner: string, repo: string, number: string): Promise<GithubPullRequestFileJson[]> {
  return client.paginate(`/repos/${owner}/${repo}/pulls/${number}/files`)
}

/**
 * Oldest first; GitHub caps this endpoint at 250 commits. It carries no per-commit
 * file lists - those cost one request per commit, so they are deliberately not fetched.
 */
export function fetchPullRequestCommits(client: GithubClient, owner: string, repo: string, number: string): Promise<GithubPullRequestCommitJson[]> {
  return client.paginate(`/repos/${owner}/${repo}/pulls/${number}/commits`)
}

/**
 * Raw unified-diff text for the whole PR, used as a fallback when GitHub omits a file's `patch`
 * (very large diffs). `undefined` when GitHub refuses to render the diff at all (406: over 300
 * files or too large).
 */
export async function fetchPullRequestDiffText(client: GithubClient, owner: string, repo: string, number: string): Promise<string | undefined> {
  try {
    return await (await client.request(`/repos/${owner}/${repo}/pulls/${number}`, { accept: 'application/vnd.github.diff' })).text()
  }
  catch (err) {
    if (err instanceof GithubApiError && err.status === 406)
      return undefined
    throw err
  }
}

/**
 * A file's full raw content at a specific ref (commit sha, branch, tag, ...), via the
 * Contents API's `raw` media type (returns the file body directly, no base64 decoding).
 * `undefined` means the file doesn't exist at that ref - expected for the base side of
 * an added file, or the head side of a removed one - not an error.
 */
export async function fetchFileContentAtRef(client: GithubClient, owner: string, repo: string, path: string, ref: string): Promise<string | undefined> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  try {
    return await (await client.request(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`, { accept: 'application/vnd.github.raw' })).text()
  }
  catch (err) {
    if (err instanceof GithubApiError && err.status === 404)
      return undefined
    throw err
  }
}
