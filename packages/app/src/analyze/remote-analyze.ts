import type { DiffSource, SharedAnalysisComment } from '@pulls.review/core/types'
import { parseSharedAnalysis } from '@pulls.review/core/types'

/** Which key the Worker resolved for a queued server-side analysis. */
export type RemoteAnalysisKeySource = 'user' | 'global'

export interface RemoteAnalysisQueued {
  jobId?: string
  keySource: RemoteAnalysisKeySource
  provider: string
  model: string
}

export type RemoteAnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded' | 'cancelled' | 'skipped'

export interface RemoteAnalysisJob {
  id: string
  status: RemoteAnalysisJobStatus
  owner: string
  repo: string
  number: number
  headSha?: string
  keySource: RemoteAnalysisKeySource
  resultId?: number
  errorCode?: string
  errorMessage?: string
  attempts: number
  createdAt?: string
  updatedAt?: string
  startedAt?: string
  finishedAt?: string
}

export interface PullRequestCoordinates {
  owner: string
  repo: string
  number: number
}

/**
 * Queue a server-side analysis on the Worker (`POST /api/analyze`). The
 * signed-in user's synced provider key pays; the host key is the fallback.
 * The Worker saves the finished result in the backend for this PR view.
 */
export async function triggerRemoteAnalysis(
  pr: PullRequestCoordinates,
  fetchFn: typeof fetch = fetch,
): Promise<RemoteAnalysisQueued> {
  const res = await fetchFn('/api/analyze', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pr),
  })
  const body = await res.json().catch(() => null) as {
    jobId?: string
    keySource?: RemoteAnalysisKeySource
    provider?: string
    model?: string
    message?: string
    error?: string
  } | null
  if (!res.ok)
    throw new Error(body?.message ?? body?.error ?? `Server analysis failed (${res.status})`)
  return {
    jobId: body?.jobId,
    keySource: body?.keySource ?? 'user',
    provider: body?.provider ?? '',
    model: body?.model ?? '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const JOB_STATUSES: RemoteAnalysisJobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'superseded', 'cancelled', 'skipped']

function parseRemoteAnalysisJob(value: unknown): RemoteAnalysisJob | undefined {
  if (!isRecord(value))
    return undefined
  if (typeof value.id !== 'string'
    || typeof value.status !== 'string'
    || !JOB_STATUSES.includes(value.status as RemoteAnalysisJobStatus)
    || typeof value.owner !== 'string'
    || typeof value.repo !== 'string'
    || typeof value.number !== 'number'
    || typeof value.attempts !== 'number') {
    return undefined
  }
  return {
    id: value.id,
    status: value.status as RemoteAnalysisJobStatus,
    owner: value.owner,
    repo: value.repo,
    number: value.number,
    headSha: typeof value.headSha === 'string' ? value.headSha : undefined,
    keySource: value.keySource === 'global' ? 'global' : 'user',
    resultId: typeof value.resultId === 'number' ? value.resultId : undefined,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    attempts: value.attempts,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : undefined,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : undefined,
  }
}

/** One tracked server analysis job; `undefined` when unknown, inaccessible, or untracked. */
export async function fetchRemoteAnalysisJob(
  jobId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RemoteAnalysisJob | undefined> {
  const res = await fetchFn(`/api/analysis-jobs/${encodeURIComponent(jobId)}`, {
    credentials: 'same-origin',
  })
  if (!res.ok)
    return undefined
  const body = await res.json().catch(() => null) as unknown
  return isRecord(body) ? parseRemoteAnalysisJob(body.job) : undefined
}

export interface AutomationOpsConfig {
  enabled: boolean
  includeDrafts: boolean
  publishCheckRun: boolean
  monthlyBudgetRuns: number | null
  locale: string
}

export interface AutomationOps {
  config: AutomationOpsConfig | null
  usage: { month: string, runs: number, budget: number | null }
  jobs: RemoteAnalysisJob[]
}

function parseAutomationConfig(value: unknown): AutomationOpsConfig | null {
  if (!isRecord(value))
    return null
  return {
    enabled: value.enabled === true,
    includeDrafts: value.includeDrafts === true,
    publishCheckRun: value.publishCheckRun === true,
    monthlyBudgetRuns: typeof value.monthlyBudgetRuns === 'number' ? value.monthlyBudgetRuns : null,
    locale: typeof value.locale === 'string' ? value.locale : 'en',
  }
}

/**
 * Repository automation operations data for admins. `undefined` when the
 * viewer is not a repository admin (the panel stays hidden).
 */
export async function fetchAutomationOps(
  repo: { owner: string, repo: string },
  fetchFn: typeof fetch = fetch,
): Promise<AutomationOps | undefined> {
  const base = `/api/automation/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
  const [configRes, jobsRes] = await Promise.all([
    fetchFn(base, { credentials: 'same-origin' }),
    fetchFn(`${base}/jobs`, { credentials: 'same-origin' }),
  ])
  if (!configRes.ok || !jobsRes.ok)
    return undefined
  const configBody = await configRes.json().catch(() => null) as unknown
  const jobsBody = await jobsRes.json().catch(() => null) as unknown
  if (!isRecord(jobsBody) || !Array.isArray(jobsBody.jobs) || !isRecord(jobsBody.usage))
    return undefined
  return {
    config: isRecord(configBody) ? parseAutomationConfig(configBody.config) : null,
    usage: {
      month: typeof jobsBody.usage.month === 'string' ? jobsBody.usage.month : '',
      runs: typeof jobsBody.usage.runs === 'number' ? jobsBody.usage.runs : 0,
      budget: typeof jobsBody.usage.budget === 'number' ? jobsBody.usage.budget : null,
    },
    jobs: jobsBody.jobs.flatMap(job => parseRemoteAnalysisJob(job) ?? []),
  }
}

export interface PrAnalysisStatus {
  analysis?: {
    headSha: string
    updatedAt: string
    summary?: string
    groups: number
    criticalGroups: number
  }
  job?: { id: string, status: RemoteAnalysisJobStatus }
}

/** Stable map key for a PR across list decorations. */
export function prStatusKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`
}

function parsePrAnalysisStatus(value: unknown): (PrAnalysisStatus & PullRequestCoordinates) | undefined {
  if (!isRecord(value) || typeof value.owner !== 'string' || typeof value.repo !== 'string' || typeof value.number !== 'number')
    return undefined
  const analysis = isRecord(value.analysis) && typeof value.analysis.headSha === 'string'
    ? {
        headSha: value.analysis.headSha,
        updatedAt: typeof value.analysis.updatedAt === 'string' ? value.analysis.updatedAt : '',
        summary: typeof value.analysis.summary === 'string' ? value.analysis.summary : undefined,
        groups: typeof value.analysis.groups === 'number' ? value.analysis.groups : 0,
        criticalGroups: typeof value.analysis.criticalGroups === 'number' ? value.analysis.criticalGroups : 0,
      }
    : undefined
  const job = isRecord(value.job) && typeof value.job.id === 'string'
    && typeof value.job.status === 'string' && JOB_STATUSES.includes(value.job.status as RemoteAnalysisJobStatus)
    ? { id: value.job.id, status: value.job.status as RemoteAnalysisJobStatus }
    : undefined
  return { owner: value.owner, repo: value.repo, number: value.number, analysis, job }
}

/** Batch server-analysis status for list decoration; unreadable PRs are simply absent. */
export async function fetchAnalysisStatuses(
  prs: PullRequestCoordinates[],
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, PrAnalysisStatus>> {
  const statuses = new Map<string, PrAnalysisStatus>()
  if (prs.length === 0)
    return statuses
  const res = await fetchFn('/api/analysis-status', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prs }),
  })
  if (!res.ok)
    return statuses
  const body = await res.json().catch(() => null) as unknown
  if (!isRecord(body) || !Array.isArray(body.statuses))
    return statuses
  for (const candidate of body.statuses) {
    const parsed = parsePrAnalysisStatus(candidate)
    if (parsed)
      statuses.set(prStatusKey(parsed.owner, parsed.repo, parsed.number), parsed)
  }
  return statuses
}

export type AnalysisRating = 'useful' | 'not_useful'

export interface AnalysisFeedback {
  resultId: number
  mine: { result?: AnalysisRating, groups: Record<string, AnalysisRating> }
  totals: { useful: number, notUseful: number }
}

/** Rate the latest server analysis for a PR (whole result or one group). */
export async function submitAnalysisFeedback(
  pr: PullRequestCoordinates,
  rating: AnalysisRating,
  groupKey?: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchFn('/api/analysis-feedback', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...pr, rating, ...(groupKey ? { groupKey } : {}) }),
  })
  return res.ok
}

/** The viewer's ratings and totals for the latest server analysis. */
export async function fetchAnalysisFeedback(
  pr: PullRequestCoordinates,
  fetchFn: typeof fetch = fetch,
): Promise<AnalysisFeedback | undefined> {
  const res = await fetchFn(`/api/analysis-feedback?owner=${encodeURIComponent(pr.owner)}&repo=${encodeURIComponent(pr.repo)}&number=${pr.number}`, {
    credentials: 'same-origin',
  })
  if (!res.ok)
    return undefined
  const body = await res.json().catch(() => null) as unknown
  if (!isRecord(body) || typeof body.resultId !== 'number' || !isRecord(body.mine) || !isRecord(body.totals))
    return undefined
  const groups: Record<string, AnalysisRating> = {}
  if (isRecord(body.mine.groups)) {
    for (const [key, value] of Object.entries(body.mine.groups)) {
      if (value === 'useful' || value === 'not_useful')
        groups[key] = value
    }
  }
  return {
    resultId: body.resultId,
    mine: {
      result: body.mine.result === 'useful' || body.mine.result === 'not_useful' ? body.mine.result : undefined,
      groups,
    },
    totals: {
      useful: typeof body.totals.useful === 'number' ? body.totals.useful : 0,
      notUseful: typeof body.totals.notUseful === 'number' ? body.totals.notUseful : 0,
    },
  }
}

/** Load server-stored analyses for a PR; an unavailable backend simply has none. */
export async function fetchBackendAnalysisResults(
  pr: PullRequestCoordinates,
  fetchFn: typeof fetch = fetch,
): Promise<SharedAnalysisComment[]> {
  const res = await fetchFn(`/api/analysis-results/${encodeURIComponent(pr.owner)}/${encodeURIComponent(pr.repo)}/${pr.number}`, {
    credentials: 'same-origin',
  })
  if (!res.ok)
    return []
  const body = await res.json().catch(() => null) as unknown
  if (!isRecord(body) || !Array.isArray(body.results))
    return []

  return body.results.flatMap((candidate) => {
    if (!isRecord(candidate))
      return []
    const analysis = parseSharedAnalysis(candidate.analysis)
    if (typeof candidate.id !== 'number'
      || typeof candidate.login !== 'string'
      || typeof candidate.url !== 'string'
      || typeof candidate.updatedAt !== 'string'
      || !analysis) {
      return []
    }
    return [{
      id: candidate.id,
      login: candidate.login,
      url: candidate.url,
      updatedAt: candidate.updatedAt,
      analysis,
    }]
  })
}

/**
 * Add backend-stored server results to a source's shared-analysis list.
 * Browser-generated shares still delegate to the source's existing upsert.
 */
export function withBackendAnalysisResults<T extends DiffSource>(
  source: T,
  pr: PullRequestCoordinates,
  fetchFn: typeof fetch = fetch,
): T {
  const sharing = source.sharing
  if (!sharing)
    return source

  return {
    ...source,
    sharing: {
      ...sharing,
      async list() {
        const [comments, backend] = await Promise.allSettled([sharing.list(), fetchBackendAnalysisResults(pr, fetchFn)])
        const commentResults = comments.status === 'fulfilled' ? comments.value : []
        const backendResults = backend.status === 'fulfilled' ? backend.value : []
        const backendLogins = new Set(backendResults.map(result => result.login))
        return [...backendResults, ...commentResults.filter(result => !backendLogins.has(result.login))]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      },
    },
  } as T
}
