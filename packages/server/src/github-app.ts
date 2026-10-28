import type { Env } from './env'

const TEXT_ENCODER = new TextEncoder()

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode a PKCS#8 PEM (GitHub App private key download) to DER bytes. */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * Mint a GitHub App JWT (RS256). GitHub requires `exp - iat <= 10 min` and
 * tolerates clock skew, so `iat` is backdated 60s.
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 */
export async function createAppJwt(appId: string, privateKeyPem: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000) - 60
  const header = toBase64Url(TEXT_ENCODER.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64Url(TEXT_ENCODER.encode(JSON.stringify({ iat, exp: iat + 540, iss: appId })))
  const key = await importPrivateKey(privateKeyPem)
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    TEXT_ENCODER.encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${toBase64Url(signature)}`
}

/** True when App ID + private key are set (server-to-server auth possible). */
export function isGithubAppConfigured(env: Env): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY)
}

interface CachedToken {
  token: string
  expiresAt: number
}

const tokenCache = new Map<number, CachedToken>()
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

/** Exchange the App JWT for an installation access token (cached per isolate until ~5 min before expiry). */
export async function getInstallationToken(
  env: Env,
  installationId: number,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const cached = tokenCache.get(installationId)
  if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS)
    return cached.token

  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY)
    throw new Error('GitHub App server-to-server auth is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY)')

  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)
  const res = await fetchFn(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pulls.review',
    },
  })
  if (!res.ok)
    throw new Error(`GitHub installation token request failed (${res.status})`)
  const payload = await res.json() as { token?: string, expires_at?: string }
  if (!payload.token || !payload.expires_at)
    throw new Error('GitHub installation token response incomplete')
  tokenCache.set(installationId, { token: payload.token, expiresAt: Date.parse(payload.expires_at) })
  return payload.token
}

/** Drop cached installation tokens (tests, key rotation). */
export function clearInstallationTokenCache(): void {
  tokenCache.clear()
}

/** The bot login installation tokens post as, e.g. `pulls-review[bot]`. */
export function appBotLogin(env: Env): string {
  return env.GITHUB_APP_SLUG ? `${env.GITHUB_APP_SLUG}[bot]` : 'github-actions[bot]'
}
