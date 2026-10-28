import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthFixture } from './auth-testing'
import { handleGithubConnections, handleRepositoryConnection } from './github-connections'
import { handleGithubRoutes } from './github-routes'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

function request(path: string) {
  return new Request(`https://pulls.shyim.de${path}`, { headers: { Cookie: fixture.cookie } })
}

describe('gitHub connections', () => {
  it('lists only installations visible to the user, with pagination and safe management URLs', async () => {
    const fetchFn = vi.fn(async () => Response.json({ installations: [
      { id: 12, account: { login: 'octo', avatar_url: 'https://github.com/octo.png', type: 'Organization' }, suspended_at: null },
      { id: 13, account: { login: 'octocat', avatar_url: '', type: 'User' }, suspended_at: '2026-01-01' },
    ] }, { headers: { Link: '<https://api.github.com/user/installations?page=3>; rel="next"' } }))
    const response = await handleGithubConnections(request('/api/github/installations?page=2'), fixture.env, fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/user/installations?per_page=100&page=2', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer access-token-for-test' }),
    }))
    expect(await response?.json()).toMatchObject({
      nextPage: 3,
      installations: [
        { id: 12, account: 'octo', suspended: false, manageUrl: 'https://github.com/organizations/octo/settings/installations/12' },
        { id: 13, account: 'octocat', suspended: true, manageUrl: 'https://github.com/settings/installations/13' },
      ],
    })
    expect(response?.headers.get('cache-control')).toBe('no-store')
  })

  it('uses the intersection of installation and user repository access', async () => {
    const fetchFn = vi.fn(async () => Response.json({ total_count: 1, repositories: [{ id: 1, owner: { login: 'octo' }, name: 'private', description: null, private: true, archived: false, permissions: { admin: true } }] }))
    const response = await handleGithubConnections(request('/api/github/installations/12/repositories'), fixture.env, fetchFn)
    expect(fetchFn.mock.calls[0]).toEqual(['https://api.github.com/user/installations/12/repositories?per_page=100&page=1', expect.anything()])
    expect(await response?.json()).toEqual({ repositories: [{ id: 1, owner: 'octo', name: 'private', description: null, private: true, archived: false, admin: true }], nextPage: null, total: 1 })
  })

  it('does not fall back to app-wide credentials for inaccessible installations', async () => {
    const fetchFn = vi.fn(async () => Response.json({ message: 'secret upstream details' }, { status: 404 }))
    const response = await handleGithubConnections(request('/api/github/installations/99/repositories'), fixture.env, fetchFn)
    expect(response?.status).toBe(404)
    expect(await response?.text()).not.toContain('secret upstream details')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('requires a session and validates pagination before calling GitHub', async () => {
    const fetchFn = vi.fn()
    const anonymous = await handleGithubConnections(new Request('https://pulls.shyim.de/api/github/installations'), fixture.env, fetchFn)
    const invalid = await handleGithubConnections(request('/api/github/installations?page=0'), fixture.env, fetchFn)
    expect(anonymous?.status).toBe(401)
    expect(invalid?.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('treats the installation return as navigation, not a trusted installation claim', async () => {
    const response = await handleGithubRoutes(request('/api/github/setup?installation_id=999&setup_action=install'), fixture.env)
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('/repositories?connected=1')
  })
})

describe('repository installation status', () => {
  it('checks user access before using app credentials', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 }))
    const response = await handleRepositoryConnection(request('/api/github/repositories/other/private'), { ...fixture.env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'not-a-real-key' }, fetchFn)
    expect(response?.status).toBe(404)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/other/private', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access-token-for-test' }) }))
  })

  it('reports an unconfigured app without claiming the repository is connected', async () => {
    const fetchFn = vi.fn(async () => Response.json({ archived: true }))
    const response = await handleRepositoryConnection(request('/api/github/repositories/octo/repo'), fixture.env, fetchFn)
    expect(await response?.json()).toEqual({ installed: false, suspended: false, archived: true })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
