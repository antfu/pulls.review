import { fetchGitlabTokenMeta } from '@pulls.review/core/gitlab'
import { GITLAB_HOST } from '../gitlab-host'
import { settings } from '../state/settings'
import { defineTokenMeta } from './useTokenMeta'

// Settings shows one GitLab token: the one for the instance this build talks to.
const gitlab = defineTokenMeta({
  storageKey: `diffs:gitlab-token-meta:${GITLAB_HOST}`,
  token: {
    get: () => settings.value.gitlabTokens[GITLAB_HOST] ?? '',
    set: (token) => {
      settings.value = { ...settings.value, gitlabTokens: { ...settings.value.gitlabTokens, [GITLAB_HOST]: token } }
    },
  },
  fetchMeta: token => fetchGitlabTokenMeta(GITLAB_HOST, token),
})

/** Meta for this instance's token outside any component scope; see `defineTokenMeta`. */
export const resolveStoredGitlabTokenMeta = gitlab.resolveStored

/** Meta for this instance's saved token, with validate-then-save. */
export const useGitlabTokenMeta = gitlab.use
