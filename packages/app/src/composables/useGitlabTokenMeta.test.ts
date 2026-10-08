import type { EffectScope } from 'vue'
import { defaultLlmSettings } from '@pulls.review/core/analyze'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { settings } from '../state/settings'
import { useGitlabTokenMeta } from './useGitlabTokenMeta'

describe('useGitlabTokenMeta', () => {
  let scope: EffectScope

  beforeEach(() => {
    scope = effectScope()
    localStorage.clear()
    settings.value = { githubToken: 'ghp_kept', gitlabTokens: {}, llm: { ...defaultLlmSettings }, locale: 'en' }
  })

  afterEach(() => {
    scope.stop()
    vi.unstubAllGlobals()
  })

  it('validates against gitlab.com, then saves the token beside the GitHub one', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url.endsWith('/user')
      ? new Response(JSON.stringify({ username: 'ada', avatar_url: 'https://gitlab.com/ada.png', name: 'Ada' }))
      : new Response(JSON.stringify({ scopes: ['api'], expires_at: null })))
    vi.stubGlobal('fetch', fetchMock)
    const { meta, saveToken } = scope.run(() => useGitlabTokenMeta())!

    await expect(saveToken('glpat-secret')).resolves.toBe(true)

    expect(fetchMock.mock.calls.every(([url]) => url.startsWith('https://gitlab.com/api/v4/'))).toBe(true)
    expect(meta.value).toMatchObject({ login: 'ada', scopes: ['api'] })
    expect(settings.value).toMatchObject({ githubToken: 'ghp_kept', gitlabTokens: { 'gitlab.com': 'glpat-secret' } })
    expect(localStorage.getItem('diffs:github-token-meta')).toBeNull()
    expect(localStorage.getItem('diffs:gitlab-token-meta:gitlab.com')).not.toContain('glpat-secret')
  })

  it('saves nothing when GitLab rejects the token, and says which host did', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: '401 Unauthorized' }), { status: 401 })))
    const { error, saveToken } = scope.run(() => useGitlabTokenMeta())!

    await expect(saveToken('glpat-bad')).resolves.toBe(false)

    expect(error.value).toContain('GitLab rejected this token')
    expect(settings.value.gitlabTokens).toEqual({})
  })
})
