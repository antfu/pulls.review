import type { Env } from './env'
import { readSession } from './auth'
import { createAppJwt, isGithubAppConfigured } from './github-app'
import { json } from './http'

interface GithubInstallation {
  id: number
  account: { login: string, avatar_url: string, type: string }
  suspended_at: string | null
}

interface GithubRepository {
  id: number
  owner: { login: string }
  name: string
  description: string | null
  private: boolean
  archived: boolean
  permissions?: { admin?: boolean }
}

/** Read through the user's GitHub token: never disclose the host's global inventory. */
export async function handleGithubConnections(request: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url)
  const match = /^\/api\/github\/installations(?:\/(\d+)\/repositories)?$/.exec(url.pathname)
  if (!match)
    return null
  if (request.method !== 'GET')
    return json({ error: 'method_not_allowed' }, 405)
  const page = Number(url.searchParams.get('page') ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000)
    return json({ error: 'invalid_page' }, 400)
  const session = await readSession(request, env)
  if (!session)
    return json({ error: 'unauthorized' }, 401)
  const path = match[1] ? `/user/installations/${match[1]}/repositories` : '/user/installations'
  try {
    const response = await fetchFn(`https://api.github.com${path}?per_page=100&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Diffwise',
      },
    })
    if (!response.ok)
      return json({ error: 'github_unavailable', message: 'Could not load GitHub connections. Check your access and try again.' }, [401, 403, 404].includes(response.status) ? response.status : 502)
    const nextPage = response.headers.get('link')?.includes('rel="next"') ? page + 1 : null
    if (match[1]) {
      const data = await response.json() as { repositories: GithubRepository[], total_count: number }
      return json({
        repositories: data.repositories.map(repo => ({
          id: repo.id,
          owner: repo.owner.login,
          name: repo.name,
          description: repo.description,
          private: repo.private,
          archived: repo.archived,
          admin: repo.permissions?.admin === true,
        })),
        total: data.total_count,
        nextPage,
      }, 200, { 'Cache-Control': 'no-store' })
    }
    const data = await response.json() as { installations: GithubInstallation[] }
    return json({
      installations: data.installations.map(installation => ({
        id: installation.id,
        account: installation.account.login,
        avatarUrl: installation.account.avatar_url,
        suspended: !!installation.suspended_at,
        manageUrl: installation.account.type === 'Organization'
          ? `https://github.com/organizations/${encodeURIComponent(installation.account.login)}/settings/installations/${installation.id}`
          : `https://github.com/settings/installations/${installation.id}`,
      })),
      nextPage,
    }, 200, { 'Cache-Control': 'no-store' })
  }
  catch {
    return json({ error: 'github_unavailable', message: 'GitHub is unavailable. Try again.' }, 502)
  }
}

/** Verify user access before checking whether this repository is installed. */
export async function handleRepositoryConnection(request: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response | null> {
  const match = /^\/api\/github\/repositories\/([\w.-]+)\/([\w.-]+)$/.exec(new URL(request.url).pathname)
  if (!match)
    return null
  if (request.method !== 'GET')
    return json({ error: 'method_not_allowed' }, 405)
  const session = await readSession(request, env)
  if (!session)
    return json({ error: 'unauthorized' }, 401)
  const path = `https://api.github.com/repos/${match[1]}/${match[2]}`
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Diffwise', 'X-GitHub-Api-Version': '2022-11-28' }
  try {
    const repo = await fetchFn(path, { headers: { ...headers, Authorization: `Bearer ${session.accessToken}` } })
    if (!repo.ok)
      return json({ error: 'repository_unavailable' }, repo.status === 404 ? 404 : 502)
    const details = await repo.json() as GithubRepository
    if (!isGithubAppConfigured(env))
      return json({ installed: false, suspended: false, archived: details.archived }, 200, { 'Cache-Control': 'no-store' })
    const jwt = await createAppJwt(env.GITHUB_APP_ID!, env.GITHUB_APP_PRIVATE_KEY!)
    const installation = await fetchFn(`${path}/installation`, { headers: { ...headers, Authorization: `Bearer ${jwt}` } })
    if (installation.status === 404)
      return json({ installed: false, suspended: false, archived: details.archived }, 200, { 'Cache-Control': 'no-store' })
    if (!installation.ok)
      return json({ error: 'github_unavailable' }, 502)
    const data = await installation.json() as GithubInstallation
    return json({ installed: true, suspended: !!data.suspended_at, archived: details.archived }, 200, { 'Cache-Control': 'no-store' })
  }
  catch {
    return json({ error: 'github_unavailable' }, 502)
  }
}
