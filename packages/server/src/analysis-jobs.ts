import type { Database } from './db/client'
import type { AnalysisConfigSource, Env } from './env'
import { sql } from 'drizzle-orm'
import { confirmPullRequestAccess } from './analysis-results'
import { json } from './http'

export type AnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded' | 'cancelled' | 'skipped'
export type AnalysisJobTrigger = 'manual' | 'webhook'

export interface StoredAnalysisJob {
  id: string
  owner: string
  repo: string
  number: number
  installationId?: number
  headSha?: string
  trigger: AnalysisJobTrigger
  deliveryId?: string
  status: AnalysisJobStatus
  configSource: AnalysisConfigSource
  resultId?: number
  checkRunId?: number
  model?: string
  promptVersion?: number
  errorCode?: string
  errorMessage?: string
  attempts: number
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
}

export interface CreateAnalysisJobInput {
  availableAt?: number
  budget?: { scopeType: string, scopeKey: string, month: string, limit?: number }
  id?: string
  owner: string
  repo: string
  number: number
  installationId?: number
  headSha?: string
  trigger: AnalysisJobTrigger
  deliveryId?: string
  configSource?: AnalysisConfigSource
}

export interface AnalysisJobFailure {
  code: string
  message: string
  final: boolean
}

export interface AnalysisJobsRepository {
  create: (input: CreateAnalysisJobInput & { id: string }, now: number) => Promise<{ job: StoredAnalysisJob, created: boolean }>
  get: (id: string) => Promise<StoredAnalysisJob | null>
  start: (id: string, now: number) => Promise<StoredAnalysisJob | null>
  succeed: (id: string, resultId: number, now: number, meta?: { model?: string, promptVersion?: number }) => Promise<void>
  fail: (id: string, failure: AnalysisJobFailure, now: number) => Promise<void>
  listForRepo: (owner: string, repo: string, limit: number) => Promise<StoredAnalysisJob[]>
  setCheckRunId: (id: string, checkRunId: number, now: number) => Promise<void>
  skip: (id: string, now: number) => Promise<void>
}

export interface AnalysisJobsDeps {
  repository?: AnalysisJobsRepository
  fetchFn?: typeof fetch
  appJwt?: (env: Env) => Promise<string | undefined>
  now?: () => number
  createId?: () => string
}

interface AnalysisJobRow {
  id: string
  delivery_id: string | null
  owner: string
  repo: string
  pr_number: number
  installation_id: number | null
  head_sha: string | null
  trigger_type: string
  status: string
  config_source_type: string
  config_source_github_user_id: number | null
  result_id: number | null
  check_run_id: number | null
  model: string | null
  prompt_version: number | null
  error_code: string | null
  error_message: string | null
  attempts: number
  created_at: number
  updated_at: number
  started_at: number | null
  finished_at: number | null
}

const JOB_COLUMNS = `id, delivery_id, owner, repo, pr_number, installation_id, head_sha,
  trigger_type, status, config_source_type, config_source_github_user_id,
  result_id, check_run_id, model, prompt_version, error_code, error_message, attempts, created_at, updated_at, started_at, finished_at`

function configSourceFromRow(row: AnalysisJobRow): AnalysisConfigSource {
  if (row.config_source_type === 'user' && row.config_source_github_user_id)
    return { type: 'user', githubUserId: row.config_source_github_user_id }
  if (row.config_source_type === 'repository')
    return { type: 'repository', owner: row.owner, repo: row.repo }
  if (row.config_source_type === 'organization')
    return { type: 'organization', owner: row.owner }
  return { type: 'global' }
}

function parseRow(row: AnalysisJobRow): StoredAnalysisJob {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    number: row.pr_number,
    installationId: row.installation_id ?? undefined,
    headSha: row.head_sha ?? undefined,
    trigger: row.trigger_type === 'webhook' ? 'webhook' : 'manual',
    deliveryId: row.delivery_id ?? undefined,
    status: row.status as AnalysisJobStatus,
    configSource: configSourceFromRow(row),
    resultId: row.result_id ?? undefined,
    checkRunId: row.check_run_id ?? undefined,
    model: row.model ?? undefined,
    promptVersion: row.prompt_version ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  }
}

export function createSqliteAnalysisJobsRepository(db: Database): AnalysisJobsRepository {
  function get(id: string) {
    const row = db.get<AnalysisJobRow>(sql`SELECT ${sql.raw(JOB_COLUMNS)} FROM analysis_job WHERE id = ${id}`)
    return row ? parseRow(row) : null
  }

  function findByDelivery(deliveryId: string) {
    const row = db.get<AnalysisJobRow>(sql`SELECT ${sql.raw(JOB_COLUMNS)} FROM analysis_job WHERE delivery_id = ${deliveryId}`)
    return row ? parseRow(row) : null
  }

  function activeJobs(input: CreateAnalysisJobInput) {
    const results = db.all<AnalysisJobRow>(sql`SELECT ${sql.raw(JOB_COLUMNS)} FROM analysis_job
      WHERE owner = ${input.owner} AND repo = ${input.repo} AND pr_number = ${input.number} AND status IN ('queued', 'running')
      ORDER BY created_at DESC, id DESC`)
    return results.map(parseRow)
  }

  function succeededForHead(input: CreateAnalysisJobInput) {
    if (!input.headSha)
      return null
    const row = db.get<AnalysisJobRow>(sql`SELECT ${sql.raw(JOB_COLUMNS)} FROM analysis_job
      WHERE owner = ${input.owner} AND repo = ${input.repo} AND pr_number = ${input.number} AND status = 'succeeded' AND head_sha = ${input.headSha}
      ORDER BY created_at DESC, id DESC`)
    return row ? parseRow(row) : null
  }

  function supersedeQueued(input: CreateAnalysisJobInput, now: number) {
    db.run(sql`UPDATE analysis_job
      SET status = 'superseded', updated_at = ${now}, finished_at = ${now}
      WHERE owner = ${input.owner} AND repo = ${input.repo} AND pr_number = ${input.number} AND status = 'queued'`)
  }

  function resolveExisting(input: CreateAnalysisJobInput, now: number): StoredAnalysisJob | null {
    if (input.deliveryId) {
      const byDelivery = findByDelivery(input.deliveryId)
      if (byDelivery)
        return byDelivery
    }
    const active = activeJobs(input)
    if (!input.headSha)
      return active[0] ?? null
    const sameHead = active.find(job => job.headSha === input.headSha) ?? succeededForHead(input)
    if (!sameHead)
      supersedeQueued(input, now)
    return sameHead
  }

  return {
    async create(input, now) {
      return db.transaction(() => {
        const existing = resolveExisting(input, now)
        if (existing)
          return { job: existing, created: false }

        if (input.budget) {
          const { scopeType, scopeKey, month, limit } = input.budget
          const usage = db.get<{ runs: number }>(sql`SELECT runs FROM automation_usage
          WHERE scope_type = ${scopeType} AND scope_key = ${scopeKey} AND month = ${month}`)
          if (limit !== undefined && (usage?.runs ?? 0) >= limit)
            throw new Error('automation_budget_exhausted')
          db.run(sql`INSERT INTO automation_usage (scope_type, scope_key, month, runs, updated_at)
          VALUES (${scopeType}, ${scopeKey}, ${month}, 1, ${now})
          ON CONFLICT(scope_type, scope_key, month) DO UPDATE SET runs = runs + 1, updated_at = excluded.updated_at`)
        }
        const source = input.configSource ?? { type: 'global' as const }
        try {
          db.run(sql`INSERT INTO analysis_job (
            id, delivery_id, owner, repo, pr_number, installation_id, head_sha, trigger_type, status,
            config_source_type, config_source_github_user_id, attempts, created_at, updated_at, available_at
          ) VALUES (${input.id}, ${input.deliveryId ?? null}, ${input.owner}, ${input.repo}, ${input.number}, ${input.installationId ?? null}, ${input.headSha ?? null}, ${input.trigger}, 'queued', ${source.type}, ${source.type === 'user' ? source.githubUserId : null}, 0, ${now}, ${now}, ${input.availableAt ?? now})`)
        }
        catch (error) {
          const existing = input.deliveryId
            ? findByDelivery(input.deliveryId)
            : (activeJobs(input)).find(job => job.headSha === input.headSha) ?? null
          if (!existing)
            throw error
          return { job: existing, created: false }
        }
        const job = get(input.id)
        if (!job)
          throw new Error('Stored analysis job could not be read back')
        return { job, created: true }
      }, { behavior: 'immediate' })
    },
    get: async id => get(id),
    async start(id, now) {
      const job = get(id)
      if (!job || (job.status !== 'queued' && job.status !== 'running'))
        return null
      const attempts = job.attempts + 1
      db.run(sql`UPDATE analysis_job
        SET status = 'running', attempts = ${attempts}, started_at = ${now}, updated_at = ${now}, error_code = NULL, error_message = NULL
        WHERE id = ${id}`)
      db.run(sql`INSERT INTO analysis_attempt (job_id, attempt_number, status, started_at)
        VALUES (${id}, ${attempts}, 'running', ${now})
        ON CONFLICT(job_id, attempt_number) DO UPDATE SET status = 'running', started_at = excluded.started_at, finished_at = NULL`)
      return get(id)
    },
    async succeed(id, resultId, now, meta) {
      db.run(sql`UPDATE analysis_job
        SET status = 'succeeded', result_id = ${resultId}, model = ${meta?.model ?? null}, prompt_version = ${meta?.promptVersion ?? null}, error_code = NULL, error_message = NULL, updated_at = ${now}, finished_at = ${now}
        WHERE id = ${id}`)
      db.run(sql`UPDATE analysis_attempt SET status = 'succeeded', finished_at = ${now}
        WHERE id = (SELECT MAX(id) FROM analysis_attempt WHERE job_id = ${id} AND status = 'running')`)
    },
    async listForRepo(owner, repo, limit) {
      const results = db.all<AnalysisJobRow>(sql`SELECT ${sql.raw(JOB_COLUMNS)} FROM analysis_job
        WHERE owner = ${owner} AND repo = ${repo}
        ORDER BY created_at DESC, id DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`)
      return results.map(parseRow)
    },
    async setCheckRunId(id, checkRunId, now) {
      db.run(sql`UPDATE analysis_job SET check_run_id = ${checkRunId}, updated_at = ${now} WHERE id = ${id}`)
    },
    async skip(id, now) {
      db.run(sql`UPDATE analysis_job SET status = 'skipped', updated_at = ${now}, finished_at = ${now} WHERE id = ${id}`)
      db.run(sql`UPDATE analysis_attempt SET status = 'skipped', finished_at = ${now}
        WHERE id = (SELECT MAX(id) FROM analysis_attempt WHERE job_id = ${id} AND status = 'running')`)
    },
    async fail(id, failure, now) {
      db.run(sql`UPDATE analysis_job
        SET status = ${failure.final ? 'failed' : 'queued'}, error_code = ${failure.code}, error_message = ${failure.message.slice(0, 1000)}, updated_at = ${now}, finished_at = ${failure.final ? now : null}
        WHERE id = ${id}`)
      db.run(sql`UPDATE analysis_attempt SET status = 'failed', error_code = ${failure.code}, error_message = ${failure.message.slice(0, 1000)}, finished_at = ${now}
        WHERE id = (SELECT MAX(id) FROM analysis_attempt WHERE job_id = ${id} AND status = 'running')`)
    },
  }
}

/** Use an injected repository in tests, or the configured SQLite store. */
export function analysisJobsRepository(env: Env, repository?: AnalysisJobsRepository): AnalysisJobsRepository | undefined {
  if (repository)
    return repository
  return env.DB ? createSqliteAnalysisJobsRepository(env.DB) : undefined
}

/** Persist a job before acknowledging the trigger; storage is required. */
export async function createTrackedAnalysisJob(
  env: Env,
  input: CreateAnalysisJobInput,
  deps: AnalysisJobsDeps = {},
): Promise<{ job: StoredAnalysisJob, created: boolean }> {
  const now = (deps.now ?? Date.now)()
  const id = input.id ?? (deps.createId ?? (() => crypto.randomUUID()))()
  const repository = analysisJobsRepository(env, deps.repository)
  if (repository)
    return repository.create({ ...input, id }, now)

  throw new Error('Analysis job storage is not configured')
}

/** Permanent failures stop immediately; transient failures use the retry budget. */
export function analysisFailure(error: unknown, finalAttempt = false): AnalysisJobFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (/has no installationId/i.test(message))
    return { code: 'missing_installation', message, final: true }
  if (/triggering user has not configured/i.test(message))
    return { code: 'user_llm_not_configured', message, final: true }
  if (/automation key is not configured/i.test(message))
    return { code: 'automation_llm_not_configured', message, final: true }
  if (/Server-side LLM is not configured/i.test(message))
    return { code: 'llm_not_configured', message, final: true }
  if (/storage is not configured/i.test(message))
    return { code: 'storage_not_configured', message, final: true }
  return { code: 'analysis_failed', message, final: finalAttempt }
}

function iso(value?: number): string | undefined {
  return value === undefined ? undefined : new Date(value).toISOString()
}

export function publicJob(job: StoredAnalysisJob) {
  return {
    id: job.id,
    status: job.status,
    owner: job.owner,
    repo: job.repo,
    number: job.number,
    headSha: job.headSha,
    keySource: job.configSource.type,
    resultId: job.resultId,
    checkRunId: job.checkRunId,
    model: job.model,
    promptVersion: job.promptVersion,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    attempts: job.attempts,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    startedAt: iso(job.startedAt),
    finishedAt: iso(job.finishedAt),
  }
}

const JOB_ROUTE_PATTERN = /^\/api\/analysis-jobs\/([^/]+)$/

/** `GET /api/analysis-jobs/:id`; inaccessible jobs are hidden as not found. */
export async function handleAnalysisJobStatus(
  request: Request,
  env: Env,
  deps: AnalysisJobsDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  const match = JOB_ROUTE_PATTERN.exec(url.pathname)
  if (!match)
    return null
  if (request.method !== 'GET')
    return json({ error: 'method not allowed' }, 405)

  let id: string
  try {
    id = decodeURIComponent(match[1]!)
  }
  catch {
    return json({ error: 'not_found' }, 404)
  }
  if (!id || id.length > 100)
    return json({ error: 'not_found' }, 404)

  const repository = analysisJobsRepository(env, deps.repository)
  const job = repository ? await repository.get(id) : null
  if (!job)
    return json({ error: 'not_found' }, 404)

  const access = await confirmPullRequestAccess(request, env, job.owner, job.repo, job.number, { fetchFn: deps.fetchFn, appJwt: deps.appJwt })
  if (access instanceof Response)
    return access
  if (!access.allowed)
    return json({ error: 'not_found' }, 404, access.headers)
  return json({ job: publicJob(job) }, 200, access.headers)
}
