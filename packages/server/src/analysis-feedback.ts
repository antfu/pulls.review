import type { AnalysisResultsRepository } from './analysis-results'
import type { Database } from './db/client'
import type { Env } from './env'
import { sql } from 'drizzle-orm'
import { analysisResultsRepository, confirmPullRequestAccess } from './analysis-results'
import { appBotLogin } from './github-app'
import { json } from './http'
import { authenticateGitHubUser } from './user-config'

export type FeedbackRating = 'useful' | 'not_useful'

export interface StoredFeedback {
  resultId: number
  owner: string
  repo: string
  number: number
  githubUserId: number
  rating: FeedbackRating
  /** Empty string rates the whole result; otherwise one group key. */
  groupKey: string
  createdAt: number
  updatedAt: number
}

export interface AnalysisFeedbackRepository {
  upsert: (entry: Omit<StoredFeedback, 'createdAt' | 'updatedAt'>, now: number) => Promise<StoredFeedback>
  listForResult: (resultId: number) => Promise<StoredFeedback[]>
}

export interface AnalysisFeedbackDeps {
  feedback?: AnalysisFeedbackRepository
  results?: AnalysisResultsRepository
  fetchFn?: typeof fetch
  appJwt?: (env: Env) => Promise<string | undefined>
  now?: () => number
}

interface FeedbackRow {
  result_id: number
  owner: string
  repo: string
  pr_number: number
  github_user_id: number
  rating: string
  group_key: string
  created_at: number
  updated_at: number
}

function parseRow(row: FeedbackRow): StoredFeedback {
  return {
    resultId: row.result_id,
    owner: row.owner,
    repo: row.repo,
    number: row.pr_number,
    githubUserId: row.github_user_id,
    rating: row.rating === 'useful' ? 'useful' : 'not_useful',
    groupKey: row.group_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSqliteAnalysisFeedbackRepository(db: Database): AnalysisFeedbackRepository {
  return {
    async upsert(entry, now) {
      db.run(sql`INSERT INTO analysis_feedback (
          result_id, owner, repo, pr_number, github_user_id, rating, group_key, created_at, updated_at
        ) VALUES (${entry.resultId}, ${entry.owner}, ${entry.repo}, ${entry.number}, ${entry.githubUserId}, ${entry.rating}, ${entry.groupKey}, ${now}, ${now})
        ON CONFLICT(result_id, github_user_id, group_key) DO UPDATE SET
          rating = excluded.rating,
          updated_at = excluded.updated_at`)
      const row = db.get<FeedbackRow>(sql`SELECT result_id, owner, repo, pr_number, github_user_id, rating, group_key, created_at, updated_at
        FROM analysis_feedback WHERE result_id = ${entry.resultId} AND github_user_id = ${entry.githubUserId} AND group_key = ${entry.groupKey}`)
      if (!row)
        throw new Error('Stored feedback could not be read back')
      return parseRow(row)
    },
    async listForResult(resultId) {
      const results = db.all<FeedbackRow>(sql`SELECT result_id, owner, repo, pr_number, github_user_id, rating, group_key, created_at, updated_at
        FROM analysis_feedback WHERE result_id = ${resultId} ORDER BY updated_at DESC`)
      return results.map(parseRow)
    },
  }
}

export function analysisFeedbackRepository(env: Env, repository?: AnalysisFeedbackRepository): AnalysisFeedbackRepository | undefined {
  if (repository)
    return repository
  return env.DB ? createSqliteAnalysisFeedbackRepository(env.DB) : undefined
}

const REPO_NAME_PATTERN = /^\w(?:[\w.-]{0,98}\w)?$/

interface FeedbackTarget { owner: string, repo: string, number: number }

function parseTarget(owner: unknown, repo: unknown, number: unknown): FeedbackTarget | null {
  if (typeof owner !== 'string' || typeof repo !== 'string' || typeof number !== 'number'
    || !REPO_NAME_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo)
    || !Number.isSafeInteger(number) || number <= 0) {
    return null
  }
  return { owner, repo, number }
}

interface ParsedFeedbackRequest {
  target: FeedbackTarget
  rating?: FeedbackRating
  groupKey: string
}

async function parseFeedbackRequest(request: Request, url: URL, headers: Headers): Promise<ParsedFeedbackRequest | Response> {
  if (request.method === 'GET') {
    const target = parseTarget(url.searchParams.get('owner'), url.searchParams.get('repo'), Number(url.searchParams.get('number')))
    return target
      ? { target, groupKey: '' }
      : json({ error: 'expected owner, repo, number query parameters' }, 400, headers)
  }
  const body = await request.json().catch(() => null) as { owner?: unknown, repo?: unknown, number?: unknown, rating?: unknown, groupKey?: unknown } | null
  const target = body ? parseTarget(body.owner, body.repo, body.number) : null
  if (!target)
    return json({ error: 'expected { owner, repo, number, rating }' }, 400, headers)
  if (body!.rating !== 'useful' && body!.rating !== 'not_useful')
    return json({ error: 'rating must be useful or not_useful' }, 400, headers)
  if (body!.groupKey !== undefined && (typeof body!.groupKey !== 'string' || body!.groupKey.length > 100))
    return json({ error: 'groupKey must be a short string' }, 400, headers)
  return { target, rating: body!.rating, groupKey: typeof body!.groupKey === 'string' ? body!.groupKey : '' }
}

function summarizeFeedback(rows: StoredFeedback[], userId: number) {
  const mine: { result?: FeedbackRating, groups: Record<string, FeedbackRating> } = { groups: {} }
  let useful = 0
  let notUseful = 0
  for (const row of rows) {
    if (row.groupKey === '') {
      if (row.rating === 'useful')
        useful++
      else
        notUseful++
    }
    if (row.githubUserId === userId) {
      if (row.groupKey === '')
        mine.result = row.rating
      else
        mine.groups[row.groupKey] = row.rating
    }
  }
  return { mine, totals: { useful, notUseful } }
}

/**
 * Per-result useful/not-useful feedback on the latest server analysis.
 * Signed-in viewers who can read the PR may rate the whole result or one
 * group; ratings feed offline evaluation, never silent prompt changes.
 */
export async function handleAnalysisFeedback(
  request: Request,
  env: Env,
  deps: AnalysisFeedbackDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/analysis-feedback')
    return null
  if (request.method !== 'GET' && request.method !== 'POST')
    return json({ error: 'method not allowed' }, 405)
  if (!env.DB && !deps.feedback)
    return json({ error: 'storage_not_configured' }, 503)

  const auth = await authenticateGitHubUser(request, env)
  if (auth instanceof Response)
    return auth

  const parsed = await parseFeedbackRequest(request, url, auth.headers)
  if (parsed instanceof Response)
    return parsed
  const { target, rating, groupKey } = parsed

  const access = await confirmPullRequestAccess(request, env, target.owner, target.repo, target.number, deps)
  if (access instanceof Response)
    return access
  if (!access.allowed)
    return json({ error: 'repo_read_access_required' }, 403, access.headers)

  const resultsRepo = analysisResultsRepository(env, deps.results)
  const results = await resultsRepo.list(target.owner, target.repo, target.number)
  const server = results.find(entry => entry.login === appBotLogin(env))
  if (!server)
    return json({ error: 'no_server_result' }, 404, access.headers)

  const feedback = analysisFeedbackRepository(env, deps.feedback)!
  if (request.method === 'POST') {
    await feedback.upsert({
      resultId: server.id,
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      githubUserId: auth.userId,
      rating: rating!,
      groupKey,
    }, (deps.now ?? Date.now)())
    return json({ ok: true, resultId: server.id }, 200, access.headers)
  }

  const rows = await feedback.listForResult(server.id)
  return json({ resultId: server.id, ...summarizeFeedback(rows, auth.userId) }, 200, access.headers)
}
