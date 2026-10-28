import type { LlmSettings } from '@pulls.review/core/analyze'
import type { Locale } from '@pulls.review/core/locales'
import type { AnalysisJobsRepository } from './analysis-jobs'
import type { Database } from './db/client'
import type { AnalysisConfigSource, Env } from './env'
import { resolveModel } from '@pulls.review/core/analyze'
import { isLocale } from '@pulls.review/core/locales'
import { defaultUserConfig, sanitizeLlmSettings } from '@pulls.review/core/user-config'
import { sql } from 'drizzle-orm'
import { analysisJobsRepository, publicJob } from './analysis-jobs'
import { sealJson, unsealJson } from './encryption'
import { json } from './http'
import { authenticateGitHubUser } from './user-config'

const MAX_BODY_BYTES = 65_536
const REPO_NAME_PATTERN = /^\w(?:[\w.-]{0,98}\w)?$/
const REPO_ROUTE_PATTERN = /^\/api\/automation\/repos\/([^/]+)\/([^/]+)(\/jobs)?$/
const ORG_ROUTE_PATTERN = /^\/api\/automation\/orgs\/([^/]+)$/

export type AutomationScope
  = | { type: 'repository', owner: string, repo: string }
    | { type: 'organization', owner: string }

export interface StoredAutomationConfig {
  scope: AutomationScope
  enabled: boolean
  includeDrafts: boolean
  publishCheckRun: boolean
  excludePaths: string[]
  monthlyBudgetRuns?: number
  locale: Locale
  llm: LlmSettings
  updatedAt: number
}

export interface AutomationConfigRepository {
  get: (scope: AutomationScope) => Promise<StoredAutomationConfig | null>
  put: (config: StoredAutomationConfig, now: number) => Promise<StoredAutomationConfig>
  delete: (scope: AutomationScope) => Promise<void>
  getUsage: (scope: AutomationScope, month: string) => Promise<number>
}

export interface AutomationConfigDeps {
  repository?: AutomationConfigRepository
  jobs?: AnalysisJobsRepository
  fetchFn?: typeof fetch
  now?: () => number
}

export function automationScopeKey(scope: AutomationScope): string {
  return scope.type === 'repository' ? `${scope.owner}/${scope.repo}` : scope.owner
}

/** UTC `YYYY-MM` bucket used for monthly run budgets. */
export function automationMonth(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}

function encryptionSecret(env: Env): string {
  return `${env.CONFIG_ENCRYPTION_SECRET || env.SESSION_SECRET}\0pulls.review:automation-config:v1`
}

interface AutomationConfigRow {
  enabled: number
  include_drafts: number
  publish_check_run: number
  exclude_paths: string
  monthly_budget_runs: number | null
  locale: string
  llm_ciphertext: string | null
  updated_at: number
}

export function createSqliteAutomationConfigRepository(db: Database, env: Env): AutomationConfigRepository {
  async function get(scope: AutomationScope) {
    const row = db.get<AutomationConfigRow>(sql`SELECT enabled, include_drafts, publish_check_run, exclude_paths, monthly_budget_runs, locale, llm_ciphertext, updated_at
      FROM automation_config WHERE scope_type = ${scope.type} AND scope_key = ${automationScopeKey(scope)}`)
    if (!row)
      return null
    const decrypted = row.llm_ciphertext ? await unsealJson<unknown>(row.llm_ciphertext, encryptionSecret(env)) : null
    return {
      scope,
      enabled: row.enabled === 1,
      includeDrafts: row.include_drafts === 1,
      publishCheckRun: row.publish_check_run === 1,
      excludePaths: parseExcludePaths(row.exclude_paths) ?? [],
      monthlyBudgetRuns: row.monthly_budget_runs ?? undefined,
      locale: isLocale(row.locale) ? row.locale : 'en',
      llm: sanitizeLlmSettings(decrypted ?? {}),
      updatedAt: row.updated_at,
    } satisfies StoredAutomationConfig
  }

  return {
    get,
    async put(config, now) {
      const ciphertext = await sealJson(config.llm, encryptionSecret(env))
      db.run(sql`INSERT INTO automation_config (
          scope_type, scope_key, enabled, include_drafts, publish_check_run, exclude_paths, monthly_budget_runs, locale, llm_ciphertext, created_at, updated_at
        ) VALUES (${config.scope.type}, ${automationScopeKey(config.scope)}, ${config.enabled ? 1 : 0}, ${config.includeDrafts ? 1 : 0}, ${config.publishCheckRun ? 1 : 0}, ${JSON.stringify(config.excludePaths)}, ${config.monthlyBudgetRuns ?? null}, ${config.locale}, ${ciphertext}, ${now}, ${now})
        ON CONFLICT(scope_type, scope_key) DO UPDATE SET
          enabled = excluded.enabled,
          include_drafts = excluded.include_drafts,
          publish_check_run = excluded.publish_check_run,
          exclude_paths = excluded.exclude_paths,
          monthly_budget_runs = excluded.monthly_budget_runs,
          locale = excluded.locale,
          llm_ciphertext = excluded.llm_ciphertext,
          updated_at = excluded.updated_at`)
      const stored = await get(config.scope)
      if (!stored)
        throw new Error('Stored automation config could not be read back')
      return stored
    },
    async delete(scope) {
      db.run(sql`DELETE FROM automation_config WHERE scope_type = ${scope.type} AND scope_key = ${automationScopeKey(scope)}`)
    },
    async getUsage(scope, month) {
      const row = db.get<{ runs: number }>(sql`SELECT runs FROM automation_usage WHERE scope_type = ${scope.type} AND scope_key = ${automationScopeKey(scope)} AND month = ${month}`)
      return row?.runs ?? 0
    },

  }
}

/** Resolve SQLite automation config when configured. */
export function automationConfigRepository(env: Env, repository?: AutomationConfigRepository): AutomationConfigRepository | undefined {
  if (repository)
    return repository
  return env.DB ? createSqliteAutomationConfigRepository(env.DB, env) : undefined
}

export interface ResolvedAutomation {
  config: StoredAutomationConfig
  source: Extract<AnalysisConfigSource, { type: 'repository' | 'organization' }>
}

/**
 * Repository config wins over organization config. A disabled repository
 * config is an explicit opt-out and does not fall through to the org.
 */
export async function resolveAutomation(
  repository: AutomationConfigRepository,
  owner: string,
  repo: string,
): Promise<ResolvedAutomation | null> {
  const repoScope: AutomationScope = { type: 'repository', owner, repo }
  const repoConfig = await repository.get(repoScope)
  if (repoConfig)
    return repoConfig.enabled ? { config: repoConfig, source: repoScope } : null
  const orgScope: AutomationScope = { type: 'organization', owner }
  const orgConfig = await repository.get(orgScope)
  return orgConfig?.enabled ? { config: orgConfig, source: orgScope } : null
}

/** Load the config behind a repository/organization job source, for the analyzer. */
export async function loadAutomationConfigForSource(
  env: Env,
  source: Extract<AnalysisConfigSource, { type: 'repository' | 'organization' }>,
  repository?: AutomationConfigRepository,
): Promise<StoredAutomationConfig | null> {
  const store = automationConfigRepository(env, repository)
  return store ? store.get(source) : null
}

function githubUserHeaders(accessToken: string): Headers {
  return new Headers({
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pulls.review',
  })
}

async function isScopeAdmin(
  accessToken: string,
  login: string,
  scope: AutomationScope,
  fetchFn: typeof fetch,
): Promise<boolean> {
  try {
    if (scope.type === 'repository') {
      const res = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(scope.owner)}/${encodeURIComponent(scope.repo)}/collaborators/${encodeURIComponent(login)}/permission`, { headers: githubUserHeaders(accessToken) })
      if (!res.ok)
        return false
      const body = await res.json() as { permission?: string, role_name?: string }
      return body.permission === 'admin' || body.role_name === 'admin'
    }
    if (login.toLowerCase() === scope.owner.toLowerCase())
      return true
    const res = await fetchFn(`https://api.github.com/user/memberships/orgs/${encodeURIComponent(scope.owner)}`, { headers: githubUserHeaders(accessToken) })
    if (!res.ok)
      return false
    const body = await res.json() as { role?: string, state?: string }
    return body.role === 'admin' && body.state === 'active'
  }
  catch {
    return false
  }
}

function publicConfig(config: StoredAutomationConfig) {
  return {
    scope: config.scope,
    enabled: config.enabled,
    includeDrafts: config.includeDrafts,
    publishCheckRun: config.publishCheckRun,
    excludePaths: config.excludePaths,
    monthlyBudgetRuns: config.monthlyBudgetRuns ?? null,
    locale: config.locale,
    llm: {
      provider: config.llm.provider,
      gatewayModel: config.llm.gatewayModel,
      anthropicModel: config.llm.anthropicModel,
      openaiBaseUrl: config.llm.openaiBaseUrl,
      openaiModel: config.llm.openaiModel,
      hasGatewayToken: config.llm.gatewayToken.length > 0,
      hasAnthropicKey: config.llm.anthropicApiKey.length > 0,
      hasOpenaiKey: config.llm.openaiApiKey.length > 0,
    },
    updatedAt: new Date(config.updatedAt).toISOString(),
  }
}

function parseRoute(url: URL): { scope: AutomationScope, jobs: boolean } | null {
  const repoMatch = REPO_ROUTE_PATTERN.exec(url.pathname)
  if (repoMatch) {
    try {
      const owner = decodeURIComponent(repoMatch[1]!)
      const repo = decodeURIComponent(repoMatch[2]!)
      return REPO_NAME_PATTERN.test(owner) && REPO_NAME_PATTERN.test(repo)
        ? { scope: { type: 'repository', owner, repo }, jobs: repoMatch[3] !== undefined }
        : null
    }
    catch {
      return null
    }
  }
  const orgMatch = ORG_ROUTE_PATTERN.exec(url.pathname)
  if (orgMatch) {
    try {
      const owner = decodeURIComponent(orgMatch[1]!)
      return REPO_NAME_PATTERN.test(owner) ? { scope: { type: 'organization', owner }, jobs: false } : null
    }
    catch {
      return null
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergedLlm(existing: LlmSettings, input: unknown): LlmSettings {
  const patch = isRecord(input) ? input : {}
  const merged: LlmSettings = { ...existing }
  for (const key of ['provider', 'gatewayToken', 'gatewayModel', 'anthropicApiKey', 'anthropicModel', 'openaiApiKey', 'openaiBaseUrl', 'openaiModel'] as const) {
    if (typeof patch[key] === 'string')
      merged[key] = patch[key] as never
  }
  return sanitizeLlmSettings(merged)
}

function parseAutomationPatch(
  payload: Record<string, unknown>,
  existing: StoredAutomationConfig | null,
): { monthlyBudgetRuns?: number, excludePaths: string[] } | string {
  let monthlyBudgetRuns = existing?.monthlyBudgetRuns
  if ('monthlyBudgetRuns' in payload) {
    if (payload.monthlyBudgetRuns === null)
      monthlyBudgetRuns = undefined
    else if (typeof payload.monthlyBudgetRuns === 'number' && Number.isSafeInteger(payload.monthlyBudgetRuns) && payload.monthlyBudgetRuns >= 1 && payload.monthlyBudgetRuns <= 100_000)
      monthlyBudgetRuns = payload.monthlyBudgetRuns
    else
      return 'monthlyBudgetRuns must be null or a positive integer.'
  }
  let excludePaths = existing?.excludePaths ?? []
  if ('excludePaths' in payload) {
    const parsed = parseExcludePaths(payload.excludePaths)
    if (!parsed)
      return 'excludePaths must be an array of glob strings.'
    excludePaths = parsed
  }
  return { monthlyBudgetRuns, excludePaths }
}

async function putAutomationConfig(
  request: Request,
  repository: AutomationConfigRepository,
  scope: AutomationScope,
  headers: Headers,
  now: number,
): Promise<Response> {
  const bodyText = await request.text()
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES)
    return json({ error: 'Automation config is too large.' }, 413, headers)
  let payload: unknown
  try {
    payload = JSON.parse(bodyText) as unknown
  }
  catch {
    return json({ error: 'Invalid JSON.' }, 400, headers)
  }
  if (!isRecord(payload))
    return json({ error: 'Invalid automation config.' }, 400, headers)

  const existing = await repository.get(scope)
  const patch = parseAutomationPatch(payload, existing)
  if (typeof patch === 'string')
    return json({ error: patch }, 400, headers)
  const { monthlyBudgetRuns, excludePaths } = patch

  const config: StoredAutomationConfig = {
    scope,
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : existing?.enabled ?? false,
    includeDrafts: typeof payload.includeDrafts === 'boolean' ? payload.includeDrafts : existing?.includeDrafts ?? false,
    publishCheckRun: typeof payload.publishCheckRun === 'boolean' ? payload.publishCheckRun : existing?.publishCheckRun ?? false,
    excludePaths,
    monthlyBudgetRuns,
    locale: isLocale(payload.locale) ? payload.locale : existing?.locale ?? 'en',
    llm: mergedLlm(existing?.llm ?? defaultUserConfig().settings.llm, payload.llm),
    updatedAt: now,
  }
  const model = resolveModel(config.llm)
  if (config.enabled && (!model?.apiKey.trim() || !model.model.id.trim()))
    return json({ error: 'model_required', message: 'Choose a model and add a provider key before enabling automatic scans.' }, 422, headers)
  const stored = await repository.put(config, now)
  return json({ config: publicConfig(stored) }, 200, headers)
}

async function authorizeScopeAdmin(request: Request, env: Env, scope: AutomationScope, deps: AutomationConfigDeps) {
  const auth = await authenticateGitHubUser(request, env)
  if (auth instanceof Response)
    return auth
  const admin = await isScopeAdmin(auth.session.accessToken, auth.session.login, scope, deps.fetchFn ?? fetch)
  return admin
    ? auth
    : json({ error: 'admin_required', message: 'Automation settings require GitHub admin access to this scope.' }, 403, auth.headers)
}

async function automationJobsView(
  env: Env,
  repository: AutomationConfigRepository,
  scope: Extract<AutomationScope, { type: 'repository' }>,
  deps: AutomationConfigDeps,
  headers: Headers,
): Promise<Response> {
  const month = automationMonth((deps.now ?? Date.now)())
  const config = await repository.get(scope) ?? await repository.get({ type: 'organization', owner: scope.owner })
  const runs = config ? await repository.getUsage(config.scope, month) : 0
  const jobsRepo = analysisJobsRepository(env, deps.jobs)
  const jobs = jobsRepo ? await jobsRepo.listForRepo(scope.owner, scope.repo, 20) : []
  return json({
    usage: { month, runs, budget: config?.monthlyBudgetRuns ?? null },
    jobs: jobs.map(publicJob),
  }, 200, headers)
}

async function readAutomationConfig(repository: AutomationConfigRepository, scope: AutomationScope, headers: Headers) {
  const config = await repository.get(scope)
  const inherited = scope.type === 'repository' ? await repository.get({ type: 'organization', owner: scope.owner }) : null
  return json({ config: config ? publicConfig(config) : null, inherited: inherited ? publicConfig(inherited) : null }, 200, headers)
}

/**
 * Repository/organization automation settings. Reads and writes require a
 * signed-in GitHub admin of the scope; provider keys are write-only and are
 * stored encrypted, never returned.
 */
export async function handleAutomationConfig(
  request: Request,
  env: Env,
  deps: AutomationConfigDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/automation/'))
    return null
  if (request.method !== 'GET' && request.headers.has('origin') && request.headers.get('origin') !== url.origin)
    return json({ error: 'invalid_origin' }, 403)
  const route = parseRoute(url)
  if (!route)
    return json({ error: 'invalid automation scope' }, 400)
  const { scope, jobs: jobsView } = route
  if (jobsView && request.method !== 'GET')
    return json({ error: 'method not allowed' }, 405)
  if (!jobsView && !['GET', 'PUT', 'DELETE'].includes(request.method))
    return json({ error: 'method not allowed' }, 405)
  if (!env.DB && !deps.repository)
    return json({ error: 'storage_not_configured' }, 503)

  const auth = await authorizeScopeAdmin(request, env, scope, deps)
  if (auth instanceof Response)
    return auth

  const repository = automationConfigRepository(env, deps.repository)!
  if (jobsView && scope.type === 'repository')
    return automationJobsView(env, repository, scope, deps, auth.headers)
  if (request.method === 'GET')
    return readAutomationConfig(repository, scope, auth.headers)
  if (request.method === 'DELETE') {
    await repository.delete(scope)
    return json({ ok: true }, 200, auth.headers)
  }
  return putAutomationConfig(request, repository, scope, auth.headers, (deps.now ?? Date.now)())
}

function parseExcludePaths(value: unknown): string[] | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    }
    catch {
      return null
    }
  }
  if (!Array.isArray(value) || value.length > 50)
    return null
  return value.every(entry => typeof entry === 'string' && entry.length > 0 && entry.length <= 200) ? value as string[] : null
}

function globToRegExp(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*'
        i++
        if (pattern[i + 1] === '/')
          i++
      }
      else {
        source += '[^/]*'
      }
    }
    else if (char === '?') {
      source += '[^/]'
    }
    else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`)
}

/** Whether a changed file path matches any automation exclude glob. */
export function isExcludedPath(patterns: string[], path: string): boolean {
  return patterns.some(pattern => globToRegExp(pattern.endsWith('/') ? `${pattern}**` : pattern).test(path))
}
