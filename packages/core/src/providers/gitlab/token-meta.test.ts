import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGitlabTokenMeta } from './token-meta'

function stub(self: Response) {
  const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url.endsWith('/user')
    ? new Response(JSON.stringify({ username: 'ada', avatar_url: 'https://gitlab.com/ada.png', name: 'Ada' }))
    : self)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchGitlabTokenMeta', () => {
  it('reads the user, scopes and expiry of a personal access token', async () => {
    const fetchMock = stub(new Response(JSON.stringify({ scopes: ['read_api'], expires_at: '2027-01-01' })))

    expect(await fetchGitlabTokenMeta('gitlab.com', 'tok')).toEqual({
      login: 'ada',
      avatarUrl: 'https://gitlab.com/ada.png',
      name: 'Ada',
      scopes: ['read_api'],
      expiresAt: Date.parse('2027-01-01'),
    })
    expect(fetchMock.mock.calls.map(([url, init]) => [url, new Headers(init.headers).get('Authorization')])).toEqual([
      ['https://gitlab.com/api/v4/user', 'Bearer tok'],
      ['https://gitlab.com/api/v4/personal_access_tokens/self', 'Bearer tok'],
    ])
  })

  it('still identifies the user of a token that cannot describe itself', async () => {
    stub(new Response('{}', { status: 404 }))
    expect(await fetchGitlabTokenMeta('gitlab.com', 'tok')).toMatchObject({ login: 'ada', scopes: [], expiresAt: null })
  })

  it('reports a rejected token as tokenRejected, naming GitLab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: '401 Unauthorized' }), { status: 401 })))
    await expect(fetchGitlabTokenMeta('gitlab.com', 'bad')).rejects.toMatchObject({ name: 'tokenRejected', message: 'GitLab rejected the token.' })
  })
})
