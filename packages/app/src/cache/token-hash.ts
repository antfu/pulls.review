/**
 * SHA-256 hex digest, used as the cache key for anything derived from a
 * secret (GitHub token meta, model lists) so the secret itself never becomes
 * a storage key.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
