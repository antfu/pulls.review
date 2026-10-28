import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient } from './client'
import { getOauthApiBase, githubOauthSession, initializeGithubSession, refreshGithubOauthSession, signInWithGithub, signOutGithub } from './github-oauth'

vi.mock('./client', async () => {
  const { ref } = await import('vue')
  const state = ref({ data: null, isPending: false, refetch: vi.fn() })
  return {
    authClient: {
      useSession: () => state,
      hydrateSession: (data: unknown) => { Object.assign(state.value, { data, isPending: false }) },
      signIn: { social: vi.fn() },
      signOut: vi.fn(async () => {
        state.value.data = null
        return { error: null }
      }),
    },
  }
})

function signedIn() {
  authClient.hydrateSession({
    user: { id: 'auth-id', githubUserId: 42, githubLogin: 'octocat', name: 'Octo', image: '', email: '42@github.invalid', emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
    session: { id: 's', userId: 'auth-id', token: 'session-token', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  })
}

beforeEach(() => {
  initializeGithubSession()
  authClient.hydrateSession(null)
  vi.clearAllMocks()
})

describe('gitHub auth adapter', () => {
  it('maps the library session to the GitHub identity used by application stores', async () => {
    signedIn()
    expect(githubOauthSession.value).toEqual({ id: 42, login: 'octocat', avatarUrl: '', name: 'Octo' })
    await refreshGithubOauthSession()
    expect(authClient.useSession().value.refetch).toHaveBeenCalledOnce()
    expect(await getOauthApiBase()).toBe(`${globalThis.location.origin}/api/github`)
    authClient.hydrateSession(null)
    expect(await getOauthApiBase()).toBeUndefined()
  })

  it('delegates login and logout to Better Auth', async () => {
    signedIn()
    signInWithGithub('/inbox')
    expect(authClient.signIn.social).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/inbox', errorCallbackURL: '/?auth=error' })
    await signOutGithub()
    expect(githubOauthSession.value).toBeNull()
  })

  it('preserves the displayed session when logout fails', async () => {
    signedIn()
    vi.mocked(authClient.signOut).mockResolvedValueOnce({ data: null, error: { message: 'Network failure', status: 503, statusText: 'Unavailable' } })
    await expect(signOutGithub()).rejects.toThrow('Network failure')
    expect(githubOauthSession.value?.id).toBe(42)
  })
})
