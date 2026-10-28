import type { ComputedRef } from 'vue'
import type { GithubOauthSession } from '../auth/github-oauth'
import { computed } from 'vue'
import {
  githubOauthSession,
  isGithubOauthAvailable,
  signInWithGithub,
  signOutGithub,
} from '../auth/github-oauth'

export interface UseGithubAccountReturn {
  /** The signed-in GitHub profile; `null` while signed out or unresolved. */
  account: ComputedRef<GithubOauthSession | null>
  /** The first hosted-session probe is still in flight. */
  busy: ComputedRef<boolean>
  /** Whether this build can start hosted GitHub OAuth. */
  oauthAvailable: boolean
  authenticated: ComputedRef<boolean>
  signIn: () => void
  signOut: () => Promise<void>
}

/**
 * The viewer's GitHub identity. Authentication is GitHub App OAuth only:
 * the browser receives profile data, never a GitHub token.
 */
export function useGithubAccount(): UseGithubAccountReturn {
  const account = computed(() => githubOauthSession.value ?? null)
  const busy = computed(() => isGithubOauthAvailable() && githubOauthSession.value === undefined)
  const authenticated = computed(() => account.value !== null)

  return {
    account,
    busy,
    oauthAvailable: isGithubOauthAvailable(),
    authenticated,
    signIn: () => signInWithGithub(),
    signOut: async () => {
      await signOutGithub()
    },
  }
}
