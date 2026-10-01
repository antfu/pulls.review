import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGithubTokenMeta } from './token-meta'

function userResponse(headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ login: 'octocat', avatar_url: 'https://example.com/a.png', name: 'The Octocat' }),
    { status: 200, headers },
  )
}

describe('fetchGithubTokenMeta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('authenticates /user with the token and maps the profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(userResponse())
    vi.stubGlobal('fetch', fetchMock)

    const meta = await fetchGithubTokenMeta('ghp_token')

    expect(meta).toEqual({
      login: 'octocat',
      avatarUrl: 'https://example.com/a.png',
      name: 'The Octocat',
      scopes: [],
      expiresAt: null,
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/user')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_token')
  })

  it('parses classic scopes and the non-ISO expiration header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(userResponse({
      'x-oauth-scopes': 'repo, read:org',
      'github-authentication-token-expiration': '2026-03-18 14:00:00 UTC',
    })))

    const meta = await fetchGithubTokenMeta('ghp_token')

    expect(meta.scopes).toEqual(['repo', 'read:org'])
    expect(meta.expiresAt).toBe(Date.parse('2026-03-18T14:00:00Z'))
  })

  it('explains a 401 as an invalid token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))

    await expect(fetchGithubTokenMeta('bad')).rejects.toMatchObject({ name: 'tokenRejected' })
  })

  it('throws on any other non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))

    await expect(fetchGithubTokenMeta('ghp_token')).rejects.toThrow(/GitHub API request failed \(500\)/)
  })
})
