import type { GithubTokenMeta } from '@pulls.review/core/github'
import type { Ref } from 'vue'
import { fetchGithubTokenMeta } from '@pulls.review/core/github'
import { onScopeDispose, ref, watch } from 'vue'
import { sha256Hex } from '../cache/token-hash'
import { localizeError } from '../i18n/core-messages'
import { settings } from '../state/settings'

/** Token meta as displayed: who it authenticates as, plus when it was saved here. */
export interface StoredGithubTokenMeta extends GithubTokenMeta {
  /** When the token was set in this browser (ms epoch). */
  setAt: number
}

interface TokenMetaCacheEntry {
  /** SHA-256 of the token the meta was fetched for - never the token itself. */
  hash: string
  meta: StoredGithubTokenMeta
}

const STORAGE_KEY = 'diffs:github-token-meta'

function readCache(): TokenMetaCacheEntry | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw)
    return null
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

/**
 * Meta for a token outside any component scope (e.g. the reviews store needs
 * the viewer's login and classic scopes): cache hit is free, a miss fetches
 * and fills the same cache the composable uses. `undefined` on any failure -
 * callers treat that as "identity unknown", never as an error.
 */
export async function resolveStoredTokenMeta(token: string): Promise<StoredGithubTokenMeta | undefined> {
  try {
    const hash = await sha256Hex(token)
    const cached = readCache()
    if (cached?.hash === hash)
      return cached.meta
    const meta: StoredGithubTokenMeta = { ...await fetchGithubTokenMeta(token), setAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hash, meta } satisfies TokenMetaCacheEntry))
    return meta
  }
  catch {
    return undefined
  }
}

export interface UseGithubTokenMetaReturn {
  /** Meta for the currently saved token; `null` while unset or unresolved. */
  meta: Ref<StoredGithubTokenMeta | null>
  /** A fetch (lazy resolve or save validation) is in flight. */
  busy: Ref<boolean>
  error: Ref<string | undefined>
  /**
   * Validate-then-save: fetches `/user` with the new token and only persists
   * (settings + meta cache) on success. An empty token clears everything.
   * Resolves `true` on success; on failure `error` is set and nothing is saved.
   */
  saveToken: (token: string) => Promise<boolean>
}

/**
 * Meta for the saved GitHub PAT, fetched once per token and cached in
 * localStorage keyed by the token's hash - reopening Settings shows the
 * cached card without re-hitting the API.
 */
export function useGithubTokenMeta(): UseGithubTokenMetaReturn {
  const meta = ref<StoredGithubTokenMeta | null>(null)
  const busy = ref(false)
  const error = ref<string>()

  // Stopping the scope stops the watcher, but not an async callback already
  // suspended at an await - bail out of those instead of fetching/writing for
  // a dead owner.
  let disposed = false
  onScopeDispose(() => {
    disposed = true
  })

  async function fetchAndCache(token: string, setAt: number): Promise<StoredGithubTokenMeta> {
    const hash = await sha256Hex(token)
    const stored: StoredGithubTokenMeta = { ...await fetchGithubTokenMeta(token), setAt }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hash, meta: stored } satisfies TokenMetaCacheEntry))
    return stored
  }

  // Resolve the already-saved token (tokens saved before this cache existed,
  // or a cleared cache): cache hit is free, a miss fetches once.
  watch(() => settings.value.githubToken, async (token) => {
    if (!token) {
      meta.value = null
      return
    }
    busy.value = true
    error.value = undefined
    try {
      const hash = await sha256Hex(token)
      if (disposed)
        return
      const cached = readCache()
      meta.value = cached?.hash === hash
        ? cached.meta
        : await fetchAndCache(token, Date.now())
    }
    catch (err) {
      error.value = localizeError(err).message
    }
    finally {
      busy.value = false
    }
  }, { immediate: true })

  async function saveToken(token: string): Promise<boolean> {
    error.value = undefined
    if (!token) {
      localStorage.removeItem(STORAGE_KEY)
      meta.value = null
      settings.value = { ...settings.value, githubToken: '' }
      return true
    }
    busy.value = true
    try {
      meta.value = await fetchAndCache(token, Date.now())
      settings.value = { ...settings.value, githubToken: token }
      return true
    }
    catch (err) {
      error.value = localizeError(err).message
      return false
    }
    finally {
      busy.value = false
    }
  }

  return { meta, busy, error, saveToken }
}
