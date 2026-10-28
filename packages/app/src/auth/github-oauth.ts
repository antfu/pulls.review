import { computed, shallowRef } from 'vue'
import { authClient } from './client'

export interface GithubOauthSession {
  id: number
  login: string
  avatarUrl: string
  name: string | null
}

/** The GitHub embed cannot use the hosted site's session. */
export function isGithubOauthAvailable(): boolean {
  return !import.meta.env.PR_EMBED
}

// Initialized by the Nuxt client plugin, so importing a service has no network
// side effects. The embed never subscribes to the hosted session.
const session = shallowRef<ReturnType<typeof initializeGithubSession>>()

export function initializeGithubSession() {
  if (!isGithubOauthAvailable())
    return
  const state = authClient.useSession()
  session.value = state
  return state
}

export const githubOauthSession = computed<GithubOauthSession | null | undefined>(() => {
  if (session.value?.value.isPending)
    return undefined
  const user = session.value?.value.data?.user
  return user
    ? { id: user.githubUserId, login: user.githubLogin, avatarUrl: user.image ?? '', name: user.name }
    : null
})

export async function refreshGithubOauthSession(): Promise<GithubOauthSession | null> {
  await session.value?.value.refetch()
  return githubOauthSession.value ?? null
}

/** The server proxy injects credentials; browser callers only receive its URL. */
export async function getOauthApiBase(): Promise<string | undefined> {
  if (!isGithubOauthAvailable())
    return undefined
  const account = githubOauthSession.value === undefined
    ? await refreshGithubOauthSession()
    : githubOauthSession.value
  const origin = globalThis.location?.origin
  return account && origin ? `${origin}/api/github` : undefined
}

export function signInWithGithub(returnTo = `${window.location.pathname}${window.location.search}`): void {
  void authClient.signIn.social({ provider: 'github', callbackURL: returnTo, errorCallbackURL: '/?auth=error' })
}

export async function signOutGithub(): Promise<void> {
  const { error } = await authClient.signOut()
  if (error)
    throw new Error(error.message || 'Could not sign out')
}
