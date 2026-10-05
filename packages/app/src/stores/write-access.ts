import type { Viewer } from '@pulls.review/core/types'
import { Diagnostic } from 'nostics'
import { computed, ref } from 'vue'
import { t } from '../i18n'

export const WRITE_BLOCKED_MESSAGE = 'This token cannot write to this repository. It needs the "repo" scope (classic token) or "Pull requests: Read and write" permission (fine-grained token).'

/**
 * Whether the viewer may write back to the source, shared by every sub-store that
 * posts (reviews, shared analyses). Starts from what the credentials claim
 * (`Viewer.canWrite`) and flips off for the session on the first refused write.
 */
export function createWriteAccess(viewer: () => Promise<Viewer | undefined>) {
  const current = ref<Viewer>()
  const writeBlockedReason = ref<string>()
  const viewerLogin = computed(() => current.value?.login)
  const canWrite = computed(() => !!current.value?.canWrite && !writeBlockedReason.value)

  async function resolve() {
    current.value = await viewer()
  }

  async function write<T>(action: () => Promise<T>): Promise<T> {
    if (!current.value)
      await resolve()
    if (!current.value)
      throw new Error(t('errors.tokenRequired'))
    try {
      return await action()
    }
    catch (err) {
      if (err instanceof Diagnostic && err.name === 'writeForbidden')
        writeBlockedReason.value = WRITE_BLOCKED_MESSAGE
      throw err
    }
  }

  return { viewerLogin, canWrite, writeBlockedReason, resolve, write }
}

export type WriteAccess = ReturnType<typeof createWriteAccess>
