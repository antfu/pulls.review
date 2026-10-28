import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthFixture } from './auth-testing'
import { appManifest, handleGithubRoutes, proxyGithub, publicConfig } from './github-routes'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

describe('proxyGithub', () => {
  it('rejects requests without a session', async () => {
    const req = new Request('https://example.com/api/github/user')
    const res = await proxyGithub(req, fixture.env, '/user')
    expect(res.status).toBe(401)
  })

  it('injects the session token server-side and discards the browser Authorization header', async () => {
    const req = new Request('https://example.com/api/github/repos/o/r/pulls/1?state=open', {
      headers: { Cookie: fixture.cookie, Authorization: 'Bearer browser-supplied', Accept: 'application/vnd.github.raw' },
    })
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.github.com/repos/o/r/pulls/1?state=open')
      const headers = init?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer access-token-for-test')
      expect(headers.get('Accept')).toBe('application/vnd.github.raw')
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const res = await proxyGithub(req, fixture.env, '/repos/o/r/pulls/1', fetchFn as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(JSON.stringify(Object.fromEntries(res.headers))).not.toContain('access-token-for-test')
  })
})

describe('handleGithubRoutes', () => {
  it('serves public config without secrets', async () => {
    const env = { GITHUB_APP_SLUG: 'pulls-review', GITHUB_CLIENT_SECRET: 'shh' } as never
    const config = publicConfig(env)
    expect(config.githubAppSlug).toBe('pulls-review')
    expect(JSON.stringify(config)).not.toContain('shh')
    const res = await handleGithubRoutes(new Request('https://example.com/api/config'), env)
    expect(res?.status).toBe(200)
  })

  it('redirects install to github.com/apps/<slug>', async () => {
    const res = await handleGithubRoutes(new Request('https://example.com/api/github/install'), { GITHUB_APP_SLUG: 'pulls-review' } as never)
    expect(res?.status).toBe(302)
    expect(res?.headers.get('Location')).toBe('https://github.com/apps/pulls-review/installations/new')
  })

  it('builds a manifest pinned to the server origin', () => {
    const manifest = appManifest('https://pulls.review')
    expect(manifest.hook_attributes.url).toBe('https://pulls.review/api/github/webhook')
    expect(manifest.callback_urls).toEqual(['https://pulls.review/api/auth/callback'])
    expect(manifest.default_permissions).toMatchObject({ contents: 'read', pull_requests: 'write' })
    // GitHub's manifest validator rejects installation lifecycle events here.
    expect(manifest.default_events).toEqual(['pull_request'])
  })
})
