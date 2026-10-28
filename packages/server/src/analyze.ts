/* eslint-disable no-console -- a queue consumer: Server logs are its output */
import type { ResolvedModel } from '@pulls.review/core/analyze'
import type { Locale } from '@pulls.review/core/locales'
import type { DiffsPayload } from '@pulls.review/core/types'
import type { UserConfig } from '@pulls.review/core/user-config'
import type { AnalysisJobsRepository } from './analysis-jobs'
import type { AnalysisResultsRepository } from './analysis-results'
import type { AutomationConfigRepository, StoredAutomationConfig } from './automation-config'
import type { AnalysisCheckRuns } from './check-runs'
import type { AnalysisConfigSource, AnalysisJob, Env } from './env'
import { resolveModel } from '@pulls.review/core/analyze'
import { llmSettingsFromEnv } from '@pulls.review/core/env'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { runLlmAnalysis } from '@pulls.review/core/llm'
import { DEFAULT_LOCALE, isLocale } from '@pulls.review/core/locales'
import { staticCredentials } from '@pulls.review/core/types'
import { analysisFailure, analysisJobsRepository } from './analysis-jobs'
import { analysisResultsRepository } from './analysis-results'
import { isExcludedPath, loadAutomationConfigForSource } from './automation-config'
import { createAnalysisCheckRuns } from './check-runs'
import { appBotLogin, getInstallationToken } from './github-app'
import { fetchRepositoryInstructions } from './repo-instructions'
import { loadUserConfig as loadStoredUserConfig } from './user-config'

export interface AnalysisDeps {
  signal?: AbortSignal
  analyze?: typeof runLlmAnalysis
  fetchDiff?: (job: AnalysisJob, token: string) => Promise<DiffsPayload>
  installationToken?: (env: Env, installationId: number) => Promise<string>
  loadUserConfig?: (env: Env, githubUserId: number) => Promise<UserConfig | null>
  loadAutomationConfig?: (env: Env, source: Extract<AnalysisConfigSource, { type: 'repository' | 'organization' }>) => Promise<StoredAutomationConfig | null>
  automation?: AutomationConfigRepository
  checkRuns?: AnalysisCheckRuns
  fetchInstructions?: (token: string, owner: string, repo: string, ref: string | undefined) => Promise<string | undefined>
  results?: AnalysisResultsRepository
  jobs?: AnalysisJobsRepository
  finalAttempt?: boolean
  now?: () => number
  log?: (line: string) => void
}

export type AnalysisJobOutcome
  = | { status: 'saved' | 'up-to-date', id: number, model?: string, promptVersion?: number }
    | { status: 'superseded' | 'skipped' }

async function fetchPullRequestDiff(job: AnalysisJob, token: string): Promise<DiffsPayload> {
  return createGithubPullRequestSource(
    { owner: job.owner, repo: job.repo, number: String(job.number) },
    staticCredentials(token),
  ).fetch()
}

export interface ResolvedAnalysisModel {
  resolved: ResolvedModel
  locale: Locale
  source: AnalysisConfigSource
  automation?: StoredAutomationConfig
}

/** Resolve the model for a job without ever falling back from a user job to the host key. */
export async function resolveAnalysisModel(env: Env, job: AnalysisJob, deps: AnalysisDeps = {}): Promise<ResolvedAnalysisModel> {
  const source = job.configSource ?? { type: 'global' as const }
  if (source.type === 'user') {
    const config = await (deps.loadUserConfig ?? loadStoredUserConfig)(env, source.githubUserId)
    const resolved = config ? resolveModel(config.settings.llm) : undefined
    if (!config || !resolved)
      throw new Error('The triggering user has not configured a synced LLM provider key')
    return { resolved, locale: config.settings.locale, source }
  }

  if (source.type === 'repository' || source.type === 'organization') {
    const load = deps.loadAutomationConfig ?? ((e: Env, s: typeof source) => loadAutomationConfigForSource(e, s, deps.automation))
    const config = await load(env, source)
    const resolved = config ? resolveModel(config.llm) : undefined
    if (!config || !resolved)
      throw new Error('The repository automation key is not configured')
    return { resolved, locale: config.locale, source, automation: config }
  }

  const resolved = resolveModel(llmSettingsFromEnv(llmEnv(env)))
  if (!resolved)
    throw new Error('Server-side LLM is not configured (set AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)')
  const locale = env.PULLS_REVIEW_LOCALE && isLocale(env.PULLS_REVIEW_LOCALE) ? env.PULLS_REVIEW_LOCALE : DEFAULT_LOCALE
  return { resolved, locale, source }
}

/** The string-valued server variables `llmSettingsFromEnv` understands. */
function llmEnv(env: Env): Record<string, string | undefined> {
  return {
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    PULLS_REVIEW_API_KEY: env.PULLS_REVIEW_API_KEY,
    PULLS_REVIEW_PROVIDER: env.PULLS_REVIEW_PROVIDER,
    PULLS_REVIEW_MODEL: env.PULLS_REVIEW_MODEL,
    PULLS_REVIEW_BASE_URL: env.PULLS_REVIEW_BASE_URL,
  }
}

/** True when a server-side model key is configured in the server environment. */
export function isServerLlmConfigured(env: Env): boolean {
  try {
    return resolveModel(llmSettingsFromEnv(llmEnv(env))) !== undefined
  }
  catch {
    return false
  }
}

/**
 * Analyze one PR with the job's configured LLM settings and save the result
 * in SQLite under the GitHub App bot login. The installation token only reads
 * the PR. A stored result already at the head sha is left alone, so
 * duplicate webhook deliveries cost no model call.
 */
async function startCheckRun(
  env: Env,
  job: AnalysisJob,
  deps: AnalysisDeps,
  automation: StoredAutomationConfig | undefined,
  token: string,
  target: { owner: string, repo: string, number: number, headSha: string },
) {
  const checkRuns = automation?.publishCheckRun ? deps.checkRuns ?? createAnalysisCheckRuns() : undefined
  const checkRunId = checkRuns ? await checkRuns.create(token, target) : undefined
  if (checkRunId !== undefined && job.jobId) {
    const jobsRepo = analysisJobsRepository(env, deps.jobs)
    await jobsRepo?.setCheckRunId(job.jobId, checkRunId, (deps.now ?? Date.now)()).catch(() => {})
  }
  return { checkRuns, checkRunId }
}

async function executeAnalysisJob(env: Env, job: AnalysisJob, deps: AnalysisDeps = {}): Promise<AnalysisJobOutcome> {
  const log = deps.log ?? (line => console.log(line))
  const analyze = deps.analyze ?? runLlmAnalysis
  if (job.installationId === undefined)
    throw new Error(`Analysis job for ${job.owner}/${job.repo}#${job.number} has no installationId`)
  const { resolved, locale, source: keySource, automation } = await resolveAnalysisModel(env, job, deps)
  const repository = analysisResultsRepository(env, deps.results)
  const token = await (deps.installationToken ?? getInstallationToken)(env, job.installationId)

  const login = appBotLogin(env)
  const diff = await (deps.fetchDiff ?? fetchPullRequestDiff)(job, token)
  const headSha = diff.head?.sha ?? ''
  const existing = await repository.get(job.owner, job.repo, job.number, login)
  if (existing && existing.analysis.headSha === headSha)
    return { status: 'up-to-date', id: existing.id, model: existing.analysis.result.model, promptVersion: existing.analysis.result.promptVersion }

  if (automation && automation.excludePaths.length > 0 && diff.files.length > 0
    && diff.files.every(file => isExcludedPath(automation.excludePaths, file.path))) {
    log(`Skipping ${job.owner}/${job.repo}#${job.number}: every changed file is excluded by automation paths`)
    return { status: 'skipped' }
  }

  const instructions = await (deps.fetchInstructions ?? fetchRepositoryInstructions)(token, job.owner, job.repo, diff.base?.sha ?? diff.base?.ref).catch(() => undefined)
  const context = {
    instructions,
    previous: existing ? { headSha: existing.analysis.headSha, result: existing.analysis.result } : undefined,
  }

  const target = { owner: job.owner, repo: job.repo, number: job.number, headSha }
  const { checkRuns, checkRunId } = await startCheckRun(env, job, deps, automation, token, target)

  log(`Analyzing ${job.owner}/${job.repo}#${job.number} (${diff.files.length} files) with ${resolved.model.provider}/${resolved.model.id} [${keySource.type} key]`)
  try {
    const { result } = await analyze(diff, resolved, locale, { context, signal: deps.signal })
    const stored = await repository.put(job.owner, job.repo, job.number, login, { headSha, result }, (deps.now ?? Date.now)())
    if (checkRuns && checkRunId !== undefined)
      await checkRuns.complete(token, target, checkRunId, { title: 'Analysis ready', summary: result.overallSummary ?? 'Grouped analysis is available in pulls.review.' })
    return { status: 'saved', id: stored.id, model: result.model, promptVersion: result.promptVersion }
  }
  catch (error) {
    if (checkRuns && checkRunId !== undefined)
      await checkRuns.complete(token, target, checkRunId, { title: 'Analysis failed', summary: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

type TrackedJobStart
  = | { outcome: AnalysisJobOutcome }
    | { tracking?: AnalysisJobsRepository }

async function beginTrackedJob(env: Env, job: AnalysisJob, deps: AnalysisDeps, now: () => number): Promise<TrackedJobStart> {
  const repository = job.jobId ? analysisJobsRepository(env, deps.jobs) : undefined
  const tracked = repository && job.jobId ? await repository.get(job.jobId) : null
  if (!tracked || !repository || !job.jobId)
    return {}
  if (tracked.status === 'superseded' || tracked.status === 'cancelled' || tracked.status === 'failed')
    return { outcome: { status: 'superseded' } }
  if (tracked.status === 'succeeded' && tracked.resultId !== undefined)
    return { outcome: { status: 'up-to-date', id: tracked.resultId } }
  const started = await repository.start(job.jobId, now())
  return started ? { tracking: repository } : { outcome: { status: 'superseded' } }
}

/** Run one job and mirror its lifecycle into the durable SQLite job ledger when present. */
export async function runAnalysisJob(env: Env, job: AnalysisJob, deps: AnalysisDeps = {}): Promise<AnalysisJobOutcome> {
  const now = deps.now ?? Date.now
  const begun = await beginTrackedJob(env, job, deps, now)
  if ('outcome' in begun && begun.outcome)
    return begun.outcome
  const tracking = 'tracking' in begun ? begun.tracking : undefined

  try {
    const outcome = await executeAnalysisJob(env, job, deps)
    if (tracking && job.jobId) {
      if (outcome.status === 'skipped')
        await tracking.skip(job.jobId, now())
      else if ('id' in outcome)
        await tracking.succeed(job.jobId, outcome.id, now(), { model: outcome.model, promptVersion: outcome.promptVersion })
    }
    return outcome
  }
  catch (error) {
    if (tracking && job.jobId)
      await tracking.fail(job.jobId, analysisFailure(error, deps.finalAttempt), now()).catch(() => {})
    throw error
  }
}
