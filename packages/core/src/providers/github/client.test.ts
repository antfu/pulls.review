import { afterEach, describe, expect, it, vi } from 'vitest'
import { staticCredentials } from '../../types/source'
import { createGithubClient, GithubApiError } from './client'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGithubClient', () => {
  it('sends the token only when there is one', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({}))
    vi.stubGlobal('fetch', fetchMock)

    await createGithubClient(staticCredentials('tok')).request('/user')
    await createGithubClient().request('/user')

    const [withToken, anonymous] = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers))
    expect(withToken!.get('Authorization')).toBe('Bearer tok')
    expect(anonymous!.has('Authorization')).toBe(false)
  })

  it('follows pages until a short one, appending to an existing query', async () => {
    const fetchMock = vi.fn(async (url: string) => json(url.endsWith('&page=1') ? Array.from({ length: 100 }, (_, i) => i) : [100]))
    vi.stubGlobal('fetch', fetchMock)

    const items = await createGithubClient().paginate<number>('/repos/o/r/pulls/1/files?x=1')

    expect(items).toHaveLength(101)
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://api.github.com/repos/o/r/pulls/1/files?x=1&per_page=100&page=1',
      'https://api.github.com/repos/o/r/pulls/1/files?x=1&per_page=100&page=2',
    ])
  })

  it('routes through a proxy base without a local token and reports authenticated', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({}))
    vi.stubGlobal('fetch', fetchMock)

    const client = createGithubClient({
      githubToken: async () => undefined,
      githubApiBase: async () => 'https://pulls.review/api/github',
    })
    await client.request('/user')

    expect(fetchMock.mock.calls[0]![0]).toBe('https://pulls.review/api/github/user')
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).has('Authorization')).toBe(false)
    expect(await client.authenticated()).toBe(true)
    expect(await createGithubClient().authenticated()).toBe(false)
    expect(await createGithubClient(staticCredentials('tok')).authenticated()).toBe(true)
  })

  it('surfaces GitHub\'s own error message with the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Resource not accessible' }, 403)))

    const failure = await createGithubClient(staticCredentials('tok')).request('/repos/o/r').catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(GithubApiError)
    expect(failure).toMatchObject({ status: 403, message: 'Resource not accessible' })
  })
})
