import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSession } from './auth'
import { createAuthFixture } from './auth-testing'
import { account as accountTable } from './db/schema'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
const origin = 'https://pulls.shyim.de'

beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => {
  vi.unstubAllGlobals()
  fixture.storage.close()
})

function request(path: string, body?: unknown, cookie = fixture.cookie) {
  return new Request(`${origin}/api/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Origin': origin, 'Cookie': cookie },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockGithub() {
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/login/oauth/access_token')) {
      return Response.json({ access_token: 'ghu_rotated', refresh_token: 'ghr_rotated', expires_in: 28800, refresh_token_expires_in: 15897600, token_type: 'bearer' })
    }
    if (url === 'https://api.github.com/user')
      return Response.json({ id: 99, login: 'new-user', name: 'New User', avatar_url: 'https://example.com/avatar', email: null })
    if (url.endsWith('/user/emails'))
      return Response.json({ message: 'Resource not accessible by integration' }, { status: 403 })
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

describe('better Auth integration', () => {
  it('returns a public profile, keeps tokens encrypted, and revokes sessions on logout', async () => {
    const response = await fixture.auth.handler(request('/get-session'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user).toMatchObject({ githubUserId: 42, githubLogin: 'octocat' })
    expect(JSON.stringify(body)).not.toContain('access-token-for-test')
    const row = fixture.storage.db.select().from(accountTable).get()!
    expect(row.accessToken).not.toContain('access-token-for-test')
    expect(row.refreshToken).not.toContain('ghr_refresh')
    expect(await readSession(request('/get-session'), fixture.env)).toMatchObject({ userId: 42, accessToken: 'access-token-for-test' })
    const logout = await fixture.auth.handler(request('/sign-out', {}))
    expect(logout.status).toBe(200)
    expect(logout.headers.getSetCookie().some(cookie => cookie.includes('Max-Age=0'))).toBe(true)
    expect(await readSession(request('/get-session'), fixture.env)).toBeNull()
  })

  it('refreshes an expired GitHub App token and persists both rotated tokens', async () => {
    const context = await fixture.auth.$context
    await context.internalAdapter.updateAccount(fixture.account.id, { accessTokenExpiresAt: new Date(0) })
    const fetchFn = mockGithub()
    expect(await readSession(request('/get-session'), fixture.env)).toMatchObject({ accessToken: 'ghu_rotated' })
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(await readSession(request('/get-session'), fixture.env)).toMatchObject({ accessToken: 'ghu_rotated' })
    expect(fetchFn).toHaveBeenCalledOnce()
    const row = fixture.storage.db.select().from(accountTable).get()!
    expect(row.refreshToken).not.toBe(fixture.account.refreshToken)
    expect(row.refreshToken).not.toContain('ghr_rotated')
  })

  it('fails closed if GitHub rejects the refresh token', async () => {
    const context = await fixture.auth.$context
    await context.internalAdapter.updateAccount(fixture.account.id, { accessTokenExpiresAt: new Date(0) })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_refresh_token' }, { status: 400 })))
    expect(await readSession(request('/get-session'), fixture.env)).toBeNull()
  })

  it('does not expose token endpoints or allow the browser to edit its GitHub identity', async () => {
    for (const path of ['/get-access-token', '/refresh-token', '/account-info', '/update-user', '/link-social']) {
      const response = await fixture.auth.handler(request(path, { accountId: fixture.account.id, githubUserId: 123 }))
      expect(response.status, path).toBe(404)
    }
  })

  it('rejects foreign origins, external callbacks, and legacy session cookies', async () => {
    const crossOrigin = new Request(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: fixture.cookie } })
    expect((await fixture.auth.handler(crossOrigin)).status).toBe(403)
    const redirect = await fixture.auth.handler(request('/sign-in/social', { provider: 'github', callbackURL: 'https://evil.example' }))
    expect(redirect.status).toBe(403)
    expect(await readSession(request('/get-session', undefined, 'pr_session=legacy-cookie'), fixture.env)).toBeNull()
  })

  it('completes OAuth without email permission and rejects replayed or invalid state', async () => {
    const fetchFn = mockGithub()
    const login = await fixture.auth.handler(request('/sign-in/social', { provider: 'github', callbackURL: '/inbox', additionalData: { githubUserId: 123, githubLogin: 'forged' } }, ''))
    expect(login.status).toBe(200)
    const authorize = new URL((await login.json()).url)
    expect(authorize.origin).toBe('https://github.com')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback`)
    expect(authorize.searchParams.get('scope') ?? '').not.toContain('user:email')
    const stateCookies = login.headers.getSetCookie()
    expect(stateCookies.length).toBeGreaterThan(0)
    expect(stateCookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('Secure'))).toBe(true)
    const cookie = stateCookies.map(cookie => cookie.split(';')[0]).join('; ')
    const state = authorize.searchParams.get('state')!
    const invalid = await fixture.auth.handler(request('/callback/github?code=example&state=invalid', undefined, cookie))
    expect(invalid.headers.get('location')).toContain('error=')
    expect(fetchFn).not.toHaveBeenCalled()
    const path = `/callback/github?code=example&state=${encodeURIComponent(state)}`
    const callback = await fixture.auth.handler(request(path, undefined, cookie))
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/inbox')
    const sessionCookie = callback.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
    expect(await readSession(request('/get-session', undefined, sessionCookie), fixture.env)).toMatchObject({ userId: 99, login: 'new-user', accessToken: 'ghu_rotated' })
    const replay = await fixture.auth.handler(request(path, undefined, cookie))
    expect(replay.headers.get('location')).toContain('error=')
  })
})
