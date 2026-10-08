import type { Credentials } from '../../types/source'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitlabClient, GitlabApiError } from './client'

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

const credentials: Credentials = {
  githubToken: async () => 'github-tok',
  gitlabToken: async host => host === 'gitlab.com' ? 'gitlab-tok' : undefined,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGitlabClient', () => {
  it('sends a host only the token saved for it, and never the GitHub token', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({}))
    vi.stubGlobal('fetch', fetchMock)

    await createGitlabClient('gitlab.com', credentials).request('/user')
    await createGitlabClient('gitlab.example.com', credentials).request('/user')
    await createGitlabClient('gitlab.com').request('/user')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://gitlab.com/api/v4/user',
      'https://gitlab.example.com/api/v4/user',
      'https://gitlab.com/api/v4/user',
    ])
    const [saved, otherHost, anonymous] = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers))
    expect(saved!.get('Authorization')).toBe('Bearer gitlab-tok')
    expect(otherHost!.has('Authorization')).toBe(false)
    expect(anonymous!.has('Authorization')).toBe(false)
  })

  it('follows the next-page header until GitLab leaves it empty', async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith('&page=1')
      ? json([1, 2], 200, { 'x-next-page': '2' })
      : json([3], 200, { 'x-next-page': '' }))
    vi.stubGlobal('fetch', fetchMock)

    const items = await createGitlabClient('gitlab.com').paginate<number>('/projects/g%2Fp/merge_requests/1/diffs?x=1')

    expect(items).toEqual([1, 2, 3])
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://gitlab.com/api/v4/projects/g%2Fp/merge_requests/1/diffs?x=1&per_page=100&page=1',
      'https://gitlab.com/api/v4/projects/g%2Fp/merge_requests/1/diffs?x=1&per_page=100&page=2',
    ])
  })

  it.each([
    [{ message: '403 Forbidden' }, '403 Forbidden'],
    [{ error: 'insufficient_scope', error_description: 'The request requires higher privileges than provided by the access token.' }, 'The request requires higher privileges than provided by the access token.'],
    [{ message: { position: ['is incomplete'] } }, '{"position":["is incomplete"]}'],
  ])('surfaces GitLab\'s own error message with the status', async (body, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(body, 403)))

    const failure = await createGitlabClient('gitlab.com', credentials).request('/projects/g%2Fp').catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(GitlabApiError)
    expect(failure).toMatchObject({ status: 403, message })
  })

  it('says a token may be needed when an anonymous request finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: '404 Project Not Found' }, 404)))

    const anonymous = await createGitlabClient('gitlab.com').request('/projects/g%2Fp').catch((err: Error) => err.message)
    const authenticated = await createGitlabClient('gitlab.com', credentials).request('/projects/g%2Fp').catch((err: Error) => err.message)

    expect(anonymous).toBe('404 Project Not Found. A private project needs a GitLab token.')
    expect(authenticated).toBe('404 Project Not Found')
  })

  it('keeps the token out of the URL and the error', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const failure = await createGitlabClient('gitlab.com', credentials).request('/user').catch((err: Error) => err.message)

    expect(fetchMock.mock.calls[0]![0]).not.toContain('gitlab-tok')
    expect(failure).toBe('GitLab API request failed (500)')
  })
})
