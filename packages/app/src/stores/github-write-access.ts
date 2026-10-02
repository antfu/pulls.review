import type { GithubClient } from '@pulls.review/core/github'
import { createGithubClient, GithubApiError } from '@pulls.review/core/github'
import { computed, ref } from 'vue'
import { resolveStoredTokenMeta } from '../composables/useGithubTokenMeta'
import { t } from '../i18n'

export const WRITE_BLOCKED_MESSAGE = 'This token cannot write to this repository. It needs the "repo" scope (classic token) or "Pull requests: Read and write" permission (fine-grained token).'

/**
 * Whether the viewer's PAT may write to GitHub, shared by every sub-store that
 * posts (reviews, shared analyses). Classic PATs are gated on their scopes
 * (`repo`/`public_repo`); fine-grained PATs expose no scopes, so they start
 * optimistic and flip off on the first 403.
 */
export function createGithubWriteAccess(token: string | undefined) {
  const viewerLogin = ref<string>()
  const scopesAllowWrite = ref(false)
  const writeBlockedReason = ref<string>()
  const canWrite = computed(() => !!token && scopesAllowWrite.value && !writeBlockedReason.value)

  async function resolve() {
    if (!token)
      return
    const meta = await resolveStoredTokenMeta(token)
    viewerLogin.value = meta?.login
    scopesAllowWrite.value = meta !== undefined
      && (meta.scopes.length === 0 || meta.scopes.includes('repo') || meta.scopes.includes('public_repo'))
  }

  /** Wraps every write: a 403 means the token can't write here - flip the session read-only. */
  async function write<T>(action: (client: GithubClient) => Promise<T>): Promise<T> {
    if (!token)
      throw new Error(t('errors.tokenRequired'))
    try {
      return await action(createGithubClient(token))
    }
    catch (err) {
      if (err instanceof GithubApiError && err.status === 403)
        writeBlockedReason.value = WRITE_BLOCKED_MESSAGE
      throw err
    }
  }

  return { viewerLogin, canWrite, writeBlockedReason, resolve, write }
}

export type GithubWriteAccess = ReturnType<typeof createGithubWriteAccess>
