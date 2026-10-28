import type { SharedAnalysis, SharedAnalysisComment } from '@pulls.review/core/types'
import type { AnalysisJobsRepository } from './analysis-jobs'
import type { Database } from './db/client'
import type { Env } from './env'
import { parseSharedAnalysis } from '@pulls.review/core/types'
import { sql } from 'drizzle-orm'
import { analysisJobsRepository } from './analysis-jobs'
import { readSession } from './auth'
import { appBotLogin, createAppJwt, isGithubAppConfigured } from './github-app'
import { json } from './http'

const REPO_NAME_PATTERN = /^\w(?:[\w.-]{0,98}\w)?$/
const ROUTE_PATTERN = /^\/api\/analysis-results\/([^/]+)\/([^/]+)\/([^/]+)$/

export interface StoredAnalysisResult {
  id: number
  login: string
  updatedAt: number
  analysis: SharedAnalysis
}

export interface AnalysisResultsRepository {
  get: (owner: string, repo: string, number: number, login: string) => Promise<StoredAnalysisResult | null>
  list: (owner: string, repo: string, number: number) => Promise<StoredAnalysisResult[]>
  put: (owner: string, repo: string, number: number, login: string, analysis: SharedAnalysis, updatedAt: number) => Promise<StoredAnalysisResult>
}

export interface AnalysisResultsDeps {
  repository?: AnalysisResultsRepository
  jobs?: AnalysisJobsRepository
  fetchFn?: typeof fetch
  appJwt?: (env: Env) => Promise<string | undefined>
}

interface AnalysisResultRow {
  id: number
  author_login: string
  result_json: string
  updated_at: number
}

function parseRow(row: AnalysisResultRow): StoredAnalysisResult | undefined {
  try {
    const analysis = parseSharedAnalysis(JSON.parse(row.result_json) as unknown)
    return analysis
      ? { id: row.id, login: row.author_login, updatedAt: row.updated_at, analysis }
      : undefined
  }
  catch {
    return undefined
  }
}

export function saveAnalysisResult(db: Database, owner: string, repo: string, number: number, login: string, analysis: SharedAnalysis, updatedAt: number): StoredAnalysisResult {
  db.run(sql`INSERT INTO analysis_result (owner, repo, pr_number, author_login, result_json, updated_at)
          VALUES (${owner}, ${repo}, ${number}, ${login}, ${JSON.stringify(analysis)}, ${updatedAt})
          ON CONFLICT(owner, repo, pr_number, author_login) DO UPDATE SET
            result_json = excluded.result_json,
            updated_at = excluded.updated_at`)
  const row = db.get<AnalysisResultRow>(sql`SELECT id, author_login, result_json, updated_at FROM analysis_result
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${number} AND author_login = ${login}`)
  const stored = row ? parseRow(row) : undefined
  if (!stored)
    throw new Error('Stored analysis result could not be read back')
  return stored
}

export function createSqliteAnalysisResultsRepository(db: Database): AnalysisResultsRepository {
  async function get(owner: string, repo: string, number: number, login: string) {
    const row = db.get<AnalysisResultRow>(sql`SELECT id, author_login, result_json, updated_at
        FROM analysis_result
        WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${number} AND author_login = ${login} COLLATE NOCASE`)
    return row ? parseRow(row) ?? null : null
  }

  return {
    get,
    async list(owner, repo, number) {
      const results = db.all<AnalysisResultRow>(sql`SELECT id, author_login, result_json, updated_at
          FROM analysis_result
          WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${number}
          ORDER BY updated_at DESC, id DESC`)
      return results.flatMap(row => parseRow(row) ?? [])
    },
    async put(owner, repo, number, login, analysis, updatedAt) {
      return saveAnalysisResult(db, owner, repo, number, login, analysis, updatedAt)
    },
  }
}

/** Resolve the configured repository for route and queue code. */
export function analysisResultsRepository(env: Env, repository?: AnalysisResultsRepository): AnalysisResultsRepository {
  if (repository)
    return repository
  if (!env.DB)
    throw new Error('Analysis result storage is not configured (DB)')
  return createSqliteAnalysisResultsRepository(env.DB)
}

class GithubUnavailableError extends Error {}

async function sessionCanRead(
  owner: string,
  repo: string,
  number: number | undefined,
  accessToken: string,
  headers: Headers,
  fetchFn: typeof fetch,
): Promise<boolean> {
  headers.set('Authorization', `Bearer ${accessToken}`)
  const path = number === undefined
    ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
  const upstream = await fetchFn(path, { headers })
  if (upstream.status === 404)
    return false
  if (!upstream.ok)
    throw new GithubUnavailableError()
  return true
}

async function anonymousCanRead(
  env: Env,
  owner: string,
  repo: string,
  number: number | undefined,
  headers: Headers,
  deps: AnalysisResultsDeps,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const jwt = await (deps.appJwt ?? defaultAppJwt)(env)
  if (jwt) {
    headers.set('Authorization', `Bearer ${jwt}`)
    const upstream = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers })
    if (upstream.status === 404)
      return false
    if (!upstream.ok)
      throw new GithubUnavailableError()
    const repository = await upstream.json().catch(() => null) as { private?: unknown } | null
    return repository?.private === false
  }

  const path = number === undefined
    ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
  const upstream = await fetchFn(path, { headers })
  if (upstream.status === 404)
    return false
  if (!upstream.ok)
    throw new GithubUnavailableError()
  return true
}

async function defaultAppJwt(env: Env): Promise<string | undefined> {
  if (!isGithubAppConfigured(env))
    return undefined
  try {
    return await createAppJwt(env.GITHUB_APP_ID!, env.GITHUB_APP_PRIVATE_KEY!)
  }
  catch {
    return undefined
  }
}

export async function confirmPullRequestAccess(
  request: Request,
  env: Env,
  owner: string,
  repo: string,
  number: number | undefined,
  deps: AnalysisResultsDeps,
): Promise<{ allowed: boolean, headers: Headers } | Response> {
  const headers = new Headers()
  const session = await readSession(request, env)

  const githubHeaders = new Headers({
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pulls.review',
  })
  const fetchFn = deps.fetchFn ?? fetch
  try {
    const allowed = session
      ? await sessionCanRead(owner, repo, number, session.accessToken, githubHeaders, fetchFn)
      : await anonymousCanRead(env, owner, repo, number, githubHeaders, deps, fetchFn)
    return { allowed, headers }
  }
  catch {
    return json({ error: 'github_unavailable' }, 502, headers)
  }
}

/**
 * `GET /api/analysis-results/:owner/:repo/:number` returns server-stored
 * analyses for a PR. GitHub is the authorization boundary: signed-in viewers
 * use their OAuth access, anonymous viewers can only read public PRs.
 */
export async function handleAnalysisResults(
  request: Request,
  env: Env,
  deps: AnalysisResultsDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  const match = ROUTE_PATTERN.exec(url.pathname)
  if (!match)
    return null
  if (request.method !== 'GET')
    return json({ error: 'method not allowed' }, 405)
  if (!env.DB && !deps.repository)
    return json({ error: 'storage_not_configured' }, 503)

  let owner: string
  let repo: string
  try {
    owner = decodeURIComponent(match[1]!)
    repo = decodeURIComponent(match[2]!)
  }
  catch {
    return json({ error: 'invalid pull request coordinates' }, 400)
  }
  const number = Number(match[3])
  if (!REPO_NAME_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo) || !Number.isSafeInteger(number) || number <= 0)
    return json({ error: 'invalid pull request coordinates' }, 400)

  const repository = analysisResultsRepository(env, deps.repository)
  const stored = await repository.list(owner, repo, number)
  if (stored.length === 0)
    return json({ results: [] })

  const access = await confirmPullRequestAccess(request, env, owner, repo, number, deps)
  if (access instanceof Response)
    return access
  if (!access.allowed)
    return json({ results: [] }, 200, access.headers)
  const results: SharedAnalysisComment[] = stored.map(result => ({
    id: result.id,
    login: result.login,
    url: `${url.origin}/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}?from=${encodeURIComponent(result.login)}`,
    updatedAt: new Date(result.updatedAt).toISOString(),
    analysis: result.analysis,
  }))
  return json({ results }, 200, access.headers)
}

const STATUS_ROUTE = '/api/analysis-status'
const MAX_STATUS_BATCH = 100

interface StatusPullRequest { owner: string, repo: string, number: number }

function parseStatusBatch(body: unknown): StatusPullRequest[] | null {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { prs?: unknown }).prs))
    return null
  const raw = (body as { prs: unknown[] }).prs
  if (raw.length > MAX_STATUS_BATCH)
    return null
  const seen = new Set<string>()
  const prs: StatusPullRequest[] = []
  for (const candidate of raw) {
    if (typeof candidate !== 'object' || candidate === null)
      return null
    const { owner, repo, number } = candidate as { owner?: unknown, repo?: unknown, number?: unknown }
    if (typeof owner !== 'string' || typeof repo !== 'string' || typeof number !== 'number'
      || !REPO_NAME_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo)
      || !Number.isSafeInteger(number) || number <= 0) {
      return null
    }
    const key = `${owner}/${repo}#${number}`.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      prs.push({ owner, repo, number })
    }
  }
  return prs
}

function countGroups(groups: StoredAnalysisResult['analysis']['result']['groups']): { groups: number, criticalGroups: number } {
  let total = 0
  let critical = 0
  const visit = (list: typeof groups) => {
    for (const group of list) {
      total++
      if (group.critical)
        critical++
      if (group.children)
        visit(group.children as typeof groups)
    }
  }
  visit(groups)
  return { groups: total, criticalGroups: critical }
}

interface StatusEntry {
  pr: StatusPullRequest
  server?: StoredAnalysisResult
  job?: { id: string, status: string, number: number }
}

async function statusEntriesForRepo(
  repository: AnalysisResultsRepository,
  jobs: { id: string, status: string, number: number }[],
  botLogin: string,
  repoPrs: StatusPullRequest[],
): Promise<StatusEntry[]> {
  const { owner, repo } = repoPrs[0]!
  return Promise.all(repoPrs.map(async (pr) => {
    const results = await repository.list(owner, repo, pr.number)
    return {
      pr,
      server: results.find(entry => entry.login === botLogin),
      job: jobs.find(entry => entry.number === pr.number),
    }
  }))
}

function publicStatusEntry({ pr, server, job }: StatusEntry) {
  return {
    owner: pr.owner,
    repo: pr.repo,
    number: pr.number,
    analysis: server
      ? {
          headSha: server.analysis.headSha,
          updatedAt: new Date(server.updatedAt).toISOString(),
          summary: server.analysis.result.overallSummary?.slice(0, 280),
          ...countGroups(server.analysis.result.groups),
        }
      : undefined,
    job: job ? { id: job.id, status: job.status } : undefined,
  }
}

async function collectRepoStatuses(
  request: Request,
  env: Env,
  deps: AnalysisResultsDeps,
  repository: AnalysisResultsRepository,
  jobsRepo: AnalysisJobsRepository | undefined,
  botLogin: string,
  byRepo: Map<string, StatusPullRequest[]>,
): Promise<{ statuses: unknown[], headers: Headers } | Response> {
  const statuses: unknown[] = []
  let headers = new Headers()
  for (const repoPrs of byRepo.values()) {
    const { owner, repo } = repoPrs[0]!
    const jobs = jobsRepo ? await jobsRepo.listForRepo(owner, repo, 100) : []
    const entries = await statusEntriesForRepo(repository, jobs, botLogin, repoPrs)

    // Repos without any stored data need no GitHub authorization round-trip:
    // there is nothing to protect, and anonymous calls stay off GitHub's
    // rate-limited paths.
    if (entries.some(entry => entry.server || entry.job)) {
      const access = await confirmPullRequestAccess(request, env, owner, repo, undefined, deps)
      if (access instanceof Response)
        return access
      headers = access.headers
      if (!access.allowed)
        continue
    }

    for (const entry of entries)
      statuses.push(publicStatusEntry(entry))
  }
  return { statuses, headers }
}

/**
 * `POST /api/analysis-status` with `{ prs: [{ owner, repo, number }] }` returns
 * compact server-analysis status per PR for list decoration. Authorization is
 * per repository: unreadable repositories are omitted entirely.
 */
export async function handleAnalysisStatusBatch(
  request: Request,
  env: Env,
  deps: AnalysisResultsDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== STATUS_ROUTE)
    return null
  if (request.method !== 'POST')
    return json({ error: 'method not allowed' }, 405)
  if (!env.DB && !deps.repository)
    return json({ error: 'storage_not_configured' }, 503)

  const prs = parseStatusBatch(await request.json().catch(() => null))
  if (!prs)
    return json({ error: 'expected { prs: [{ owner, repo, number }] } (max 100)' }, 400)

  const repository = analysisResultsRepository(env, deps.repository)
  const jobsRepo = analysisJobsRepository(env, deps.jobs)
  const botLogin = appBotLogin(env)
  const byRepo = new Map<string, StatusPullRequest[]>()
  for (const pr of prs) {
    const key = `${pr.owner}/${pr.repo}`.toLowerCase()
    byRepo.set(key, [...(byRepo.get(key) ?? []), pr])
  }

  const collected = await collectRepoStatuses(request, env, deps, repository, jobsRepo, botLogin, byRepo)
  if (collected instanceof Response)
    return collected
  const { statuses, headers } = collected
  return json({ statuses }, 200, headers)
}
