import type { AnalysisJobsRepository } from './analysis-jobs'
import type { AutomationConfigRepository } from './automation-config'
import type { AnalysisJob, Env } from './env'
import type { GithubRepositoryPayload } from './installations'
import { createTrackedAnalysisJob } from './analysis-jobs'
import { automationConfigRepository, automationMonth, automationScopeKey, resolveAutomation } from './automation-config'
import { json } from './http'
import { deleteInstallationRecord, syncInstallationRecord, syncInstallationRepositories, upsertGithubRepository } from './installations'

const TEXT_ENCODER = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length)
    return false
  let diff = 0
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verify GitHub's `X-Hub-Signature-256: sha256=<hex>` HMAC over the raw body. */
export async function verifyWebhookSignature(secret: string, body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256='))
    return false
  const key = await crypto.subtle.importKey('raw', TEXT_ENCODER.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(body))
  const hex = Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(`sha256=${hex}`, signatureHeader)
}

interface WebhookPayload {
  action?: string
  installation?: { id?: number, account?: { login?: string, type?: string }, repository_selection?: string }
  pull_request?: { number?: number, draft?: boolean, head?: { sha?: string } }
  repository?: GithubRepositoryPayload
  repositories?: GithubRepositoryPayload[]
  repositories_added?: GithubRepositoryPayload[]
  repositories_removed?: GithubRepositoryPayload[]
}

export interface WebhookDeps {
  jobs?: AnalysisJobsRepository
  automation?: AutomationConfigRepository
  now?: () => number
  createJobId?: () => string
}

const ANALYZE_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review'])

/** Extract an analysis job from a `pull_request` payload, or `undefined` when the event needs none. */
export function analysisJobFromPayload(payload: WebhookPayload, includeDrafts = false): AnalysisJob | undefined {
  if (!payload.action || !ANALYZE_ACTIONS.has(payload.action))
    return undefined
  if (payload.pull_request?.draft && !includeDrafts && payload.action !== 'ready_for_review')
    return undefined
  const owner = payload.repository?.owner?.login
  const repo = payload.repository?.name
  const number = payload.pull_request?.number
  if (!owner || !repo || number === undefined)
    return undefined
  return {
    owner,
    repo,
    number,
    installationId: payload.installation?.id,
    headSha: payload.pull_request?.head?.sha,
  }
}

async function handleInstallationEvent(env: Env, event: string, payload: WebhookPayload): Promise<Response> {
  const installationId = payload.installation!.id!
  if (payload.action === 'deleted') {
    await deleteInstallationRecord(env, installationId)
  }
  else {
    const record = {
      id: installationId,
      accountLogin: payload.installation?.account?.login,
      accountType: payload.installation?.account?.type,
      repositorySelection: payload.installation?.repository_selection,
      suspended: payload.action === 'suspend' ? true : payload.action === 'unsuspend' ? false : undefined,
    }
    await syncInstallationRecord(env, record)
    await syncInstallationRepositories(
      env,
      installationId,
      event === 'installation_repositories' ? payload.repositories_added ?? [] : payload.repositories ?? [],
      event === 'installation_repositories' ? payload.repositories_removed ?? [] : [],
    )
  }
  return json({ ok: true, event, action: payload.action })
}

async function automationForPayload(env: Env, payload: WebhookPayload, deps: WebhookDeps, now: number) {
  const owner = payload.repository?.owner?.login
  const repoName = payload.repository?.name
  const automationRepo = automationConfigRepository(env, deps.automation)
  const resolved = automationRepo && owner && repoName ? await resolveAutomation(automationRepo, owner, repoName) : null
  const month = automationMonth(now)
  let budgetExhausted = false
  if (resolved && automationRepo && resolved.config.monthlyBudgetRuns !== undefined)
    budgetExhausted = await automationRepo.getUsage(resolved.config.scope, month) >= resolved.config.monthlyBudgetRuns
  return { automationRepo, resolved, month, budgetExhausted }
}

async function handlePullRequestEvent(env: Env, payload: WebhookPayload, deliveryId?: string, deps: WebhookDeps = {}): Promise<Response> {
  if (payload.repository)
    await upsertGithubRepository(env, payload.repository, payload.installation?.id)

  const now = (deps.now ?? Date.now)()
  const { resolved, month, budgetExhausted } = await automationForPayload(env, payload, deps, now)

  const job = analysisJobFromPayload(payload, resolved?.config.includeDrafts ?? false)
  if (!job)
    return json({ ok: true, event: 'pull_request', action: payload.action, queued: false })
  if (job.installationId === undefined)
    return json({ ok: true, event: 'pull_request', action: payload.action, queued: false, reason: 'installation missing' }, 202)
  if (!resolved)
    return json({ ok: true, event: 'pull_request', action: payload.action, queued: false, reason: 'repository automation is not enabled' }, 202)

  if (budgetExhausted)
    return json({ ok: true, event: 'pull_request', action: payload.action, queued: false, reason: 'automation budget exhausted' }, 202)

  const tracked = await createTrackedAnalysisJob(env, {
    ...job,
    trigger: 'webhook',
    availableAt: now + 10_000,
    budget: resolved
      ? {
          scopeType: resolved.config.scope.type,
          scopeKey: automationScopeKey(resolved.config.scope),
          month,
          limit: resolved.config.monthlyBudgetRuns,
        }
      : undefined,
    deliveryId,
    configSource: resolved?.source ?? { type: 'global' },
  }, { repository: deps.jobs, now: deps.now, createId: deps.createJobId })
  if (!tracked.created)
    return json({ ok: true, event: 'pull_request', action: payload.action, queued: false, deduplicated: true, jobId: tracked.job.id }, 202)

  return json({ ok: true, event: 'pull_request', action: payload.action, queued: true, jobId: tracked.job.id }, 202)
}

/**
 * `POST /api/github/webhook`, the GitHub App's webhook endpoint.
 * Persists installations and durably schedules opt-in repository analysis.
 */
export async function handleWebhook(request: Request, env: Env, deps: WebhookDeps = {}): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/github/webhook' || request.method !== 'POST')
    return null

  if (!env.GITHUB_WEBHOOK_SECRET)
    return json({ error: 'GitHub webhook is not configured (GITHUB_WEBHOOK_SECRET)' }, 503)

  const body = await request.text()
  if (!await verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get('X-Hub-Signature-256')))
    return json({ error: 'invalid signature' }, 401)

  let payload: WebhookPayload
  try {
    payload = JSON.parse(body) as WebhookPayload
  }
  catch {
    return json({ error: 'invalid JSON' }, 400)
  }

  const event = request.headers.get('X-GitHub-Event') ?? ''
  if (event === 'ping')
    return json({ ok: true, pong: true })
  if ((event === 'installation' || event === 'installation_repositories') && payload.installation?.id !== undefined)
    return handleInstallationEvent(env, event, payload)
  if (event === 'pull_request') {
    return handlePullRequestEvent(env, payload, request.headers.get('X-GitHub-Delivery') ?? undefined, deps).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'automation_budget_exhausted')
        return json({ ok: true, queued: false, reason: 'automation budget exhausted' }, 202)
      throw error
    })
  }
  return json({ ok: true, event, ignored: true })
}
