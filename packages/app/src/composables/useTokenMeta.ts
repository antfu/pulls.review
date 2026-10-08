import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'
import { sha256Hex } from '../cache/token-hash'
import { localizeError } from '../i18n/core-messages'

/** Who a saved token authenticates as, plus what the token itself can do and until when. */
export interface TokenMeta {
  login: string
  avatarUrl: string
  name: string | null
  scopes: string[]
  /** Token expiration (ms epoch), `null` when it never expires. */
  expiresAt: number | null
}

/** Token meta as displayed: who it authenticates as, plus when it was saved here. */
export interface StoredTokenMeta extends TokenMeta {
  /** When the token was set in this browser (ms epoch). */
  setAt: number
}

interface TokenMetaCacheEntry {
  /** SHA-256 of the token the meta was fetched for - never the token itself. */
  hash: string
  meta: StoredTokenMeta
}

export interface UseTokenMetaReturn {
  /** Meta for the currently saved token; `null` while unset or unresolved. */
  meta: Ref<StoredTokenMeta | null>
  /** A fetch (lazy resolve or save validation) is in flight. */
  busy: Ref<boolean>
  error: Ref<string | undefined>
  /**
   * Validate-then-save: fetches the token's user and only persists (settings + meta
   * cache) on success. An empty token clears everything.
   * Resolves `true` on success; on failure `error` is set and nothing is saved.
   */
  saveToken: (token: string) => Promise<boolean>
}

export interface TokenMetaOptions {
  /** localStorage key of the meta cache; one per host, so no host reads another's. */
  storageKey: string
  /** Where the token itself is saved; `''` is no token. */
  token: { get: () => string, set: (token: string) => void }
  /** Throws when the host rejects the token. */
  fetchMeta: (token: string) => Promise<TokenMeta>
}

/**
 * Meta for one host's saved token, fetched once per token and cached in
 * localStorage keyed by the token's hash - reopening Settings shows the cached
 * card without re-hitting the API.
 */
export function defineTokenMeta({ storageKey, token: saved, fetchMeta }: TokenMetaOptions) {
  function readCache(): TokenMetaCacheEntry | null {
    const raw = localStorage.getItem(storageKey)
    if (!raw)
      return null
    try {
      return JSON.parse(raw)
    }
    catch {
      return null
    }
  }

  async function fetchAndCache(token: string): Promise<StoredTokenMeta> {
    const hash = await sha256Hex(token)
    const meta: StoredTokenMeta = { ...await fetchMeta(token), setAt: Date.now() }
    localStorage.setItem(storageKey, JSON.stringify({ hash, meta } satisfies TokenMetaCacheEntry))
    return meta
  }

  /**
   * Meta for a token outside any component scope (e.g. the reviews store needs
   * the viewer's login and scopes): cache hit is free, a miss fetches and fills
   * the same cache the composable uses. `undefined` on any failure - callers
   * treat that as "identity unknown", never as an error.
   */
  async function resolveStored(token: string): Promise<StoredTokenMeta | undefined> {
    try {
      const hash = await sha256Hex(token)
      const cached = readCache()
      return cached?.hash === hash ? cached.meta : await fetchAndCache(token)
    }
    catch {
      return undefined
    }
  }

  function use(): UseTokenMetaReturn {
    const meta = ref<StoredTokenMeta | null>(null)
    const busy = ref(false)
    const error = ref<string>()

    // Stopping the scope stops the watcher, but not an async callback already
    // suspended at an await - bail out of those instead of fetching/writing for
    // a dead owner.
    let disposed = false
    onScopeDispose(() => {
      disposed = true
    })

    // Resolve the already-saved token (tokens saved before this cache existed,
    // or a cleared cache): cache hit is free, a miss fetches once.
    watch(saved.get, async (token) => {
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
          : await fetchAndCache(token)
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
        localStorage.removeItem(storageKey)
        meta.value = null
        saved.set('')
        return true
      }
      busy.value = true
      try {
        meta.value = await fetchAndCache(token)
        saved.set(token)
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

  return { resolveStored, use }
}
