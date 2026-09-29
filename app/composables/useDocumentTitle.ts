import type { MaybeRefOrGetter } from 'vue'
import { useTitle } from '@vueuse/core'
import { toValue } from 'vue'

const APP_NAME = 'pulls.review'

/**
 * Drives the browser tab title off whatever the current route/page is showing - a PR
 * title on the GitHub page, the diff name on `/upload`, or nothing on the landing page.
 * The reactive getter is re-read on every change and reset to the plain `APP_NAME` when
 * the page has no subject, so navigating back home never leaves a stale PR title behind.
 *
 * SPA-only: the pages are the one place this is called, so the github.com embed
 * (`EmbedApp.ce.vue`, which renders `DiffsPage` directly) never hijacks the host tab.
 */
export function useDocumentTitle(subject: MaybeRefOrGetter<string | undefined>): void {
  useTitle(() => {
    const value = toValue(subject)?.trim()
    return value ? `${value} · ${APP_NAME}` : APP_NAME
  })
}
