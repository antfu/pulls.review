const GITHUB_API_BASE = 'https://api.github.com'

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

/** A non-ok GitHub response, keeping the status so callers can react to auth/permission failures (401/403). */
export class GithubApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'GithubApiError'
  }
}

export function buildHeaders(token?: string, accept = 'application/vnd.github+json'): HeadersInit {
  const headers: Record<string, string> = {
    'Accept': accept,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token)
    headers.Authorization = `Bearer ${token}`
  return headers
}

async function githubFetch(url: string, token: string | undefined, accept?: string): Promise<Response> {
  const res = await fetch(url, { headers: buildHeaders(token, accept) })
  if (!res.ok)
    throw new GithubApiError(res.status, `GitHub API request failed (${res.status}): ${url}`)
  return res
}

export async function fetchPullRequest(owner: string, repo: string, number: string, token?: string): Promise<GithubPullRequestJson> {
  const res = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}`, token)
  return res.json()
}

export async function fetchPullRequestFiles(owner: string, repo: string, number: string, token?: string): Promise<GithubPullRequestFileJson[]> {
  const files: GithubPullRequestFileJson[] = []
  let page = 1
  // GitHub caps at 100 per page and 3000 files total across pages for this endpoint.
  for (;;) {
    const res = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`, token)
    const pageFiles: GithubPullRequestFileJson[] = await res.json()
    files.push(...pageFiles)
    if (pageFiles.length < 100)
      break
    page++
  }
  return files
}

/** Raw unified-diff text for the whole PR, used as a fallback when GitHub omits a file's `patch` (very large diffs). */
export async function fetchPullRequestDiffText(owner: string, repo: string, number: string, token?: string): Promise<string> {
  const res = await githubFetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${number}`, token, 'application/vnd.github.diff')
  return res.text()
}

/**
 * A file's full raw content at a specific ref (commit sha, branch, tag, ...), via the
 * Contents API's `raw` media type (returns the file body directly, no base64 decoding).
 * `undefined` means the file doesn't exist at that ref - expected for the base side of
 * an added file, or the head side of a removed one - not an error.
 */
export async function fetchFileContentAtRef(owner: string, repo: string, path: string, ref: string, token?: string): Promise<string | undefined> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  const res = await fetch(url, { headers: buildHeaders(token, 'application/vnd.github.raw') })
  if (res.status === 404)
    return undefined
  if (!res.ok)
    throw new Error(`GitHub API request failed (${res.status}): ${url}`)
  return res.text()
}
