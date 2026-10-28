import type { UserConfig } from '@pulls.review/core/user-config'
import type { AnalysisJobsRepository } from './analysis-jobs'
import type { AuthSession } from './auth'
import type { AnalysisConfigSource, Env } from './env'
import { resolveModel } from '@pulls.review/core/analyze'
import { createTrackedAnalysisJob } from './analysis-jobs'
import { isServerLlmConfigured, resolveAnalysisModel } from './analyze'
import { readSession } from './auth'
import { cookieHeader, parseCookies } from './cookies'
import { createAppJwt, isGithubAppConfigured } from './github-app'
import { escapeHtml, json } from './http'
import { listInstallations, syncInstallationRecord } from './installations'
import { authenticateGitHubUser, loadUserConfig } from './user-config'

const GITHUB_API_BASE = 'https://api.github.com'
const MANIFEST_STATE_COOKIE = 'pr_manifest_state'

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Public, secret-free backend capabilities for the SPA (`GET /api/config`). */
export function publicConfig(env: Env) {
  return {
    githubAppSlug: env.GITHUB_APP_SLUG ?? null,
    installations: isGithubAppConfigured(env),
    webhook: Boolean(env.GITHUB_WEBHOOK_SECRET),
    serverLlm: isServerLlmConfigured(env),
  }
}

/** `GET /repos/{owner}/{repo}/installation` with App JWT auth. */
export async function findRepoInstallationId(env: Env, owner: string, repo: string, fetchFn: typeof fetch = fetch): Promise<number | undefined> {
  if (!isGithubAppConfigured(env))
    return undefined
  const jwt = await createAppJwt(env.GITHUB_APP_ID!, env.GITHUB_APP_PRIVATE_KEY!)
  const res = await fetchFn(`${GITHUB_API_BASE}/repos/${owner}/${repo}/installation`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pulls.review',
    },
  })
  if (!res.ok)
    return undefined
  const payload = await res.json() as { id?: number }
  return payload.id
}

const HOP_HEADERS = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding']

/**
 * Proxy one request to `api.github.com` with the signed-in user's token held
 * server-side. Any `Authorization` header from the browser is discarded.
 */
export async function proxyGithub(request: Request, env: Env, pathname: string, fetchFn: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  const fresh = await readSession(request, env)
  if (!fresh)
    return json({ error: 'unauthorized' }, 401)

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${fresh.accessToken}`)
  headers.set('Accept', request.headers.get('Accept') ?? 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', request.headers.get('X-GitHub-Api-Version') ?? '2022-11-28')
  headers.set('User-Agent', 'pulls.review')
  const contentType = request.headers.get('Content-Type')
  if (contentType)
    headers.set('Content-Type', contentType)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await fetchFn(`${GITHUB_API_BASE}${pathname}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Required by Node when forwarding a streaming request body.
    ...(hasBody ? { duplex: 'half' } as Record<string, string> : {}),
  })

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, name) => {
    if (!HOP_HEADERS.includes(name.toLowerCase()))
      responseHeaders.set(name, value)
  })
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

/** GitHub App manifest for one-click registration at this server's origin. */
export function appManifest(origin: string, name = 'Diffwise') {
  return {
    name,
    url: origin,
    hook_attributes: { url: `${origin}/api/github/webhook`, active: true },
    redirect_url: `${origin}/api/github/app/manifest/callback`,
    callback_urls: [`${origin}/api/auth/callback`],
    setup_url: `${origin}/api/github/setup`,
    public: true,
    default_permissions: {
      contents: 'read',
      issues: 'write',
      pull_requests: 'write',
      metadata: 'read',
      checks: 'write',
    },
    // Installation lifecycle events are delivered to every App automatically;
    // GitHub's manifest validator rejects them as explicit subscriptions.
    default_events: ['pull_request'],
  }
}

function manifestPage(origin: string, state: string): Response {
  const manifest = escapeHtml(JSON.stringify(appManifest(origin)))
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Create the Diffwise GitHub App</title></head>
<body style="font-family:system-ui;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1>Create the Diffwise GitHub App</h1>
<p>One click registers a GitHub App for <code>${escapeHtml(origin)}</code> with the
OAuth callback, webhook URL, permissions (contents: read, issues + pull requests: write)
and the pull_request event pre-filled (installation events arrive automatically). Review on GitHub, click
<strong>Create GitHub App</strong>, and you are redirected back here with the
credentials to add to your server environment.</p>
<p>If the name is taken, edit it here first: <input id="name" value="Diffwise" style="font:inherit"></p>
<form id="f" action="https://github.com/settings/apps/new?state=${state}" method="post">
<input type="hidden" name="manifest" id="manifest" value="${manifest}">
<button type="submit" style="font:inherit;padding:.5rem 1rem">Register GitHub App on github.com</button>
</form>
<script>document.getElementById('name').addEventListener('input',e=>{const m=JSON.parse(document.getElementById('manifest').value);m.name=e.target.value;document.getElementById('manifest').value=JSON.stringify(m)})</script>
</body></html>`
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', cookieHeader(MANIFEST_STATE_COOKIE, state, { maxAge: 600, secure: origin.startsWith('https:') }))
  return new Response(html, { headers })
}

interface ManifestConversion {
  id?: number
  slug?: string
  client_id?: string
  client_secret?: string
  webhook_secret?: string
  pem?: string
}

function manifestResultPage(app: ManifestConversion): Response {
  const rows: [string, string][] = [
    ['GITHUB_APP_ID', String(app.id ?? '')],
    ['GITHUB_APP_SLUG', app.slug ?? ''],
    ['GITHUB_CLIENT_ID', app.client_id ?? ''],
    ['GITHUB_CLIENT_SECRET', app.client_secret ?? ''],
    ['GITHUB_WEBHOOK_SECRET', app.webhook_secret ?? ''],
    ['GITHUB_APP_PRIVATE_KEY', app.pem ?? ''],
  ]
  const commands = rows.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')
  const areas = rows.map(([name, value]) => `<label style="display:block;margin:.75rem 0.25rem"><code>${escapeHtml(name)}</code><textarea readonly rows="${name === 'GITHUB_APP_PRIVATE_KEY' ? 8 : 1}" style="display:block;width:100%;font-family:monospace">${escapeHtml(value)}</textarea></label>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GitHub App created</title></head>
<body style="font-family:system-ui;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1>GitHub App created: ${escapeHtml(app.slug ?? '')}</h1>
<p><strong>Shown once.</strong> Add these values to your server environment, then close this tab:</p>
<pre style="overflow:auto;background:#111;color:#eee;padding:1rem">${escapeHtml(commands)}</pre>
<p>Generate SESSION_SECRET and CONFIG_ENCRYPTION_SECRET separately and add them to your environment: <code>openssl rand -hex 32</code></p>
${areas}
<p>After the secrets are set, restart the app (<code>docker compose up -d</code>) and install the App from <code>/api/github/install</code>.</p>
</body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function handleInstallRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/github/install' && request.method === 'GET') {
    if (!env.GITHUB_APP_SLUG)
      return json({ error: 'GitHub App is not configured (GITHUB_APP_SLUG). Register it via /api/github/app/new.' }, 503)
    return new Response(null, { status: 302, headers: { Location: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new` } })
  }
  if (url.pathname === '/api/github/setup' && request.method === 'GET') {
    const installationId = Number(url.searchParams.get('installation_id'))
    if (installationId)
      await syncInstallationRecord(env, { id: installationId })
    return new Response(null, { status: 302, headers: { Location: '/?installed=1' } })
  }
  if (url.pathname === '/api/github/installations' && request.method === 'GET') {
    if (!await readSession(request, env))
      return json({ error: 'unauthorized' }, 401)
    return json(await listInstallations(env))
  }
  return null
}

async function handleManifestRoutes(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/github/app/new' && request.method === 'GET')
    return manifestPage(url.origin, randomToken())
  if (url.pathname !== '/api/github/app/manifest/callback' || request.method !== 'GET')
    return null
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = parseCookies(request.headers.get('Cookie'))[MANIFEST_STATE_COOKIE]
  if (!code || !state || !expected || state !== expected)
    return json({ error: 'invalid manifest callback (code/state)' }, 400)
  const res = await fetch(`${GITHUB_API_BASE}/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'pulls.review' },
  })
  if (!res.ok)
    return json({ error: `GitHub manifest conversion failed (${res.status})` }, 502)
  return manifestResultPage(await res.json() as ManifestConversion)
}

export interface AnalyzeRouteDeps {
  loadUserConfig?: (env: Env, githubUserId: number) => Promise<UserConfig | null>
  fetchFn?: typeof fetch
  findInstallationId?: (env: Env, owner: string, repo: string) => Promise<number | undefined>
  jobs?: AnalysisJobsRepository
  now?: () => number
  createJobId?: () => string
}

const REPO_NAME_PATTERN = /^\w(?:[\w.-]{0,98}\w)?$/

function githubUserHeaders(accessToken: string): Headers {
  return new Headers({
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pulls.review',
  })
}

async function hasPullRequestReadAccess(
  accessToken: string,
  owner: string,
  repo: string,
  number: number,
  fetchFn: typeof fetch,
): Promise<boolean> {
  try {
    const res = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`, {
      headers: githubUserHeaders(accessToken),
    })
    return res.ok
  }
  catch {
    return false
  }
}

async function hasRepoWriteAccess(
  accessToken: string,
  owner: string,
  repo: string,
  login: string,
  fetchFn: typeof fetch,
): Promise<boolean> {
  try {
    const res = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(login)}/permission`, {
      headers: githubUserHeaders(accessToken),
    })
    if (!res.ok)
      return false
    const body = await res.json() as { permission?: string, role_name?: string }
    return ['admin', 'maintain', 'write'].includes(body.permission ?? '')
      || ['admin', 'maintain', 'write'].includes(body.role_name ?? '')
  }
  catch {
    return false
  }
}

async function authorizeAnalyzeAccess(
  source: AnalysisConfigSource,
  auth: { session: AuthSession, headers: Headers },
  owner: string,
  repo: string,
  number: number,
  fetchFn: typeof fetch,
): Promise<Response | null> {
  if (source.type === 'user') {
    const canRead = await hasPullRequestReadAccess(auth.session.accessToken, owner, repo, number, fetchFn)
    return canRead
      ? null
      : json({
          error: 'repo_read_access_required',
          message: 'Triggering server analysis with your key requires read access to this pull request.',
        }, 403, auth.headers)
  }

  const canWrite = await hasRepoWriteAccess(auth.session.accessToken, owner, repo, auth.session.login, fetchFn)
  return canWrite
    ? null
    : json({
        error: 'repo_write_access_required',
        message: 'Triggering server analysis with the host key requires write access to this repository.',
      }, 403, auth.headers)
}

async function dispatchManualAnalysis(
  env: Env,
  fields: { owner: string, repo: string, number: number, installationId: number },
  source: AnalysisConfigSource,
  deps: AnalyzeRouteDeps,
) {
  const tracked = await createTrackedAnalysisJob(env, {
    ...fields,
    trigger: 'manual',
    configSource: source,
  }, { repository: deps.jobs, now: deps.now, createId: deps.createJobId })

  return tracked
}

/**
 * `POST /api/analyze` queues a server-side analysis triggered by the signed-in
 * user. Their synced provider key pays when configured; otherwise the host's
 * global host key is the fallback. Repository/org keys can later slot
 * between those sources. The supplied installation id is never trusted: the
 * repo's installation is resolved from the App. A user-key run only needs
 * read access to the PR; a host-key run requires repository write access
 * because the host pays for the repo's stored server analysis.
 */
export async function handleAnalyzeRoute(
  request: Request,
  env: Env,
  url: URL,
  deps: AnalyzeRouteDeps = {},
): Promise<Response | null> {
  if (url.pathname !== '/api/analyze' || request.method !== 'POST')
    return null

  const auth = await authenticateGitHubUser(request, env)
  if (auth instanceof Response)
    return auth

  const body = await request.json().catch(() => null) as { owner?: unknown, repo?: unknown, number?: unknown } | null
  const owner = typeof body?.owner === 'string' ? body.owner : ''
  const repo = typeof body?.repo === 'string' ? body.repo : ''
  const number = typeof body?.number === 'number' ? body.number : Number.NaN
  if (!REPO_NAME_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo) || !Number.isSafeInteger(number) || number <= 0)
    return json({ error: 'expected { owner, repo, number }' }, 400, auth.headers)

  const config = await (deps.loadUserConfig ?? loadUserConfig)(env, auth.userId)
  const userResolved = config ? resolveModel(config.settings.llm) : undefined
  let source: AnalysisConfigSource
  let resolvedModel: { provider: string, id: string }
  if (userResolved) {
    source = { type: 'user', githubUserId: auth.userId }
    resolvedModel = userResolved.model
  }
  else if (isServerLlmConfigured(env)) {
    source = { type: 'global' }
    resolvedModel = (await resolveAnalysisModel(env, { owner, repo, number, configSource: source })).resolved.model
  }
  else {
    return json({
      error: 'llm_not_configured',
      message: 'Add a model provider key in Settings, or configure a server-side model key on the host.',
    }, 422, auth.headers)
  }

  const denied = await authorizeAnalyzeAccess(source, auth, owner, repo, number, deps.fetchFn ?? fetch)
  if (denied)
    return denied

  const installationId = await (deps.findInstallationId ?? findRepoInstallationId)(env, owner, repo)
  if (installationId === undefined)
    return json({ error: 'not_installed', message: 'The GitHub App is not installed on this repository.' }, 422, auth.headers)

  const tracked = await dispatchManualAnalysis(env, { owner, repo, number, installationId }, source, deps)

  return json({ ok: true, queued: tracked.created, deduplicated: !tracked.created, jobId: tracked.job.id, keySource: source.type, provider: resolvedModel.provider, model: resolvedModel.id }, 202, auth.headers)
}

/** All non-auth, non-webhook API routes: config, install/setup, manifest, analyze trigger, GitHub proxy. */
export async function handleGithubRoutes(request: Request, env: Env, analyzeDeps: AnalyzeRouteDeps = {}): Promise<Response | null> {
  const url = new URL(request.url)

  if (url.pathname === '/api/config' && request.method === 'GET')
    return json(publicConfig(env))

  const handled = await handleInstallRoutes(request, env, url)
    ?? await handleManifestRoutes(request, url)
    ?? await handleAnalyzeRoute(request, env, url, analyzeDeps)
  if (handled)
    return handled

  if (url.pathname.startsWith('/api/github/'))
    return proxyGithub(request, env, url.pathname.slice('/api/github'.length))

  return null
}
