import type { EffectScope } from 'vue'
import { defaultLlmSettings } from '@pulls.review/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { settings } from '../state/settings'
import { useGithubTokenMeta } from './useGithubTokenMeta'

const STORAGE_KEY = 'diffs:github-token-meta'

function userResponse(login = 'octocat'): Response {
  return new Response(
    JSON.stringify({ login, avatar_url: `https://example.com/${login}.png`, name: null }),
    { status: 200, headers: { 'x-oauth-scopes': 'repo' } },
  )
}

describe('useGithubTokenMeta', () => {
  let scope: EffectScope

  beforeEach(() => {
    scope = effectScope()
    localStorage.removeItem(STORAGE_KEY)
    settings.value = { githubToken: '', llm: { ...defaultLlmSettings }, locale: 'en' }
  })

  afterEach(() => {
    scope.stop()
    vi.unstubAllGlobals()
  })

  function setup() {
    return scope.run(() => useGithubTokenMeta())!
  }

  it('saveToken validates via /user, then persists the token and caches meta by hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(userResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { meta, saveToken } = setup()

    await expect(saveToken('ghp_secret')).resolves.toBe(true)

    expect(settings.value.githubToken).toBe('ghp_secret')
    expect(meta.value?.login).toBe('octocat')
    expect(meta.value?.scopes).toEqual(['repo'])
    expect(meta.value?.setAt).toBeTypeOf('number')
    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(raw).not.toContain('ghp_secret')
    expect(JSON.parse(raw).hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reuses the cached meta for the same token instead of refetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(userResponse())
    vi.stubGlobal('fetch', fetchMock)
    await setup().saveToken('ghp_secret')

    const second = scope.run(() => useGithubTokenMeta())!
    await vi.waitFor(() => expect(second.meta.value?.login).toBe('octocat'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves a pre-existing token lazily when no cache entry exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(userResponse('existing'))
    vi.stubGlobal('fetch', fetchMock)
    settings.value = { ...settings.value, githubToken: 'ghp_existing' }

    const { meta } = setup()

    await vi.waitFor(() => expect(meta.value?.login).toBe('existing'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })

  it('rejects an invalid token without persisting it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    const { meta, error, saveToken } = setup()

    await expect(saveToken('bad')).resolves.toBe(false)

    expect(settings.value.githubToken).toBe('')
    expect(meta.value).toBeNull()
    expect(error.value).toMatch(/rejected this token/)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears the token, meta, and cache on empty save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(userResponse()))
    const { meta, saveToken } = setup()
    await saveToken('ghp_secret')

    await expect(saveToken('')).resolves.toBe(true)

    expect(settings.value.githubToken).toBe('')
    expect(meta.value).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
