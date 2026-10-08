import type { StoredTokenMeta, UseTokenMetaReturn } from './useTokenMeta'
import { fetchGithubTokenMeta } from '@pulls.review/core/github'
import { settings } from '../state/settings'
import { defineTokenMeta } from './useTokenMeta'

export type StoredGithubTokenMeta = StoredTokenMeta
export type UseGithubTokenMetaReturn = UseTokenMetaReturn

const github = defineTokenMeta({
  storageKey: 'diffs:github-token-meta',
  token: {
    get: () => settings.value.githubToken,
    set: (token) => {
      settings.value = { ...settings.value, githubToken: token }
    },
  },
  fetchMeta: fetchGithubTokenMeta,
})

/** Meta for a GitHub PAT outside any component scope; see `defineTokenMeta`. */
export const resolveStoredTokenMeta = github.resolveStored

/** Meta for the saved GitHub PAT, with validate-then-save. */
export const useGithubTokenMeta = github.use
