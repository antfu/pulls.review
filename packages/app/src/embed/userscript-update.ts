import type { Credentials } from '@pulls.review/core/types'
import { createGithubClient } from '@pulls.review/core/github'
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'
import { SITE_ORIGIN } from './githubIntegration'

export const USERSCRIPT_URL = `${SITE_ORIGIN}/pulls-review-github.user.js`

const REPO = 'antfu/pulls.review'
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Whether a newer userscript is installable. The installed one `@require`s this bundle
 * at `?<sha>`, so the compiled-in sha is the installed version; the latest is the
 * repo's newest production deployment - github.com's CSP blocks fetching pulls.review
 * itself, but api.github.com is allowed. One check per interval, remembered across
 * page loads; the button reads the remembered answer in the meantime.
 */
export function useUserscriptUpdate(credentials: Credentials) {
  const installed = import.meta.env.PR_EMBED_SHA
  const check = useLocalStorage('diffs-embed:update-check', { at: 0, sha: '' })
  const updateAvailable = computed(() => !!installed && !!check.value.sha && !check.value.sha.startsWith(installed))

  if (installed && Date.now() - check.value.at > CHECK_INTERVAL) {
    createGithubClient(credentials)
      .request(`/repos/${REPO}/deployments?environment=Production&per_page=1`)
      .then(res => res.json() as Promise<{ sha: string }[]>)
      .then(([latest]) => {
        if (latest)
          check.value = { at: Date.now(), sha: latest.sha }
      })
      .catch(() => {})
  }

  return { updateAvailable }
}
