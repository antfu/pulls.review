import type { GithubClient } from './client'
import { GithubApiError } from './client'

export interface GithubPullRequestJson {
  title: string
  body: string | null
  user: { login: string, avatar_url?: string } | null
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

interface GithubCommitJson extends GithubPullRequestCommitJson {
  html_url: string
  commit: { message: string, author: { name?: string, date?: string } | null }
  author: { login: string, avatar_url: string } | null
  parents: { sha: string }[]
}

/** A files listing entry outside a PR; `sha` is `null` for entries such as submodules. */
export interface GithubDiffEntryJson extends Omit<GithubPullRequestFileJson, 'sha'> {
  sha: string | null
}

export interface GithubCompareJson {
  html_url: string
  merge_base_commit: { sha: string }
  commits: GithubCommitJson[]
  /** Capped by GitHub at 300 entries. */
  files?: GithubDiffEntryJson[]
}

export interface GithubSingleCommitJson extends GithubCommitJson {
  files?: GithubDiffEntryJson[]
}

/** Keeps the slashes of a branch like `feat/x` while escaping everything else. */
function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/')
}

/** `base...head` as GitHub resolves it; capped at 250 commits and 300 files. */
export async function fetchCompare(client: GithubClient, owner: string, repo: string, base: string, head: string): Promise<GithubCompareJson> {
  return (await client.request(`/repos/${owner}/${repo}/compare/${encodeRef(base)}...${encodeRef(head)}`)).json()
}

export async function fetchCommit(client: GithubClient, owner: string, repo: string, sha: string): Promise<GithubSingleCommitJson> {
  return (await client.request(`/repos/${owner}/${repo}/commits/${encodeRef(sha)}`)).json()
}

/** The commit sha a branch, tag or sha currently points at - a cheap staleness probe. */
export async function fetchRefSha(client: GithubClient, owner: string, repo: string, ref: string): Promise<string> {
  return (await (await client.request(`/repos/${owner}/${repo}/commits/${encodeRef(ref)}`, { accept: 'application/vnd.github.sha' })).text()).trim()
}

/** `.diff` text for any path that renders one (a PR, a compare, a commit); `undefined` when GitHub refuses (406). */
export async function fetchDiffText(client: GithubClient, path: string): Promise<string | undefined> {
  try {
    return await (await client.request(path, { accept: 'application/vnd.github.diff' })).text()
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
