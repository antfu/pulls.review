import type { Ref } from 'vue'
import type { GithubOauthSession } from '../auth/github-oauth'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { githubOauthSession } from '../auth/github-oauth'
import { useGithubAccount } from './useGithubAccount'

vi.mock('../auth/github-oauth', async () => {
  const { ref } = await import('vue')
  return {
    githubOauthSession: ref(undefined),
    isGithubOauthAvailable: () => true,
    signInWithGithub: vi.fn(),
    signOutGithub: vi.fn(),
  }
})

const mockedSession = githubOauthSession as Ref<GithubOauthSession | null | undefined>

describe('useGithubAccount', () => {
  it('exposes only the OAuth profile as the authenticated identity', () => {
    mockedSession.value = {
      id: 42,
      login: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
      name: 'The Octocat',
    }
    const scope = effectScope()
    const account = scope.run(() => useGithubAccount())!

    expect(account.authenticated.value).toBe(true)
    expect(account.account.value).toMatchObject({ id: 42, login: 'octocat' })
    expect(account).not.toHaveProperty('saveToken')
    scope.stop()
    mockedSession.value = undefined
    vi.restoreAllMocks()
  })
})
