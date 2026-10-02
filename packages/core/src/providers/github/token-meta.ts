import { diagnostics } from '../../diagnostics'
import { createGithubClient, GithubApiError } from './client'

/** Who a PAT authenticates as, plus what the token itself can do and until when. */
export interface GithubTokenMeta {
  login: string
  avatarUrl: string
  name: string | null
  /** Classic-PAT scopes from the `x-oauth-scopes` header; empty for fine-grained tokens. */
  scopes: string[]
  /** Token expiration (ms epoch) from the `github-authentication-token-expiration` header, `null` when the token never expires. */
  expiresAt: number | null
}

/**
 * GitHub sends the expiration as `2026-03-18 14:00:00 UTC` (not ISO 8601), so
 * normalize before parsing and treat anything unparsable as "no expiration".
 */
function parseExpiration(header: string | null): number | null {
  if (!header)
    return null
  const time = Date.parse(header.replace(' UTC', 'Z').replace(' ', 'T'))
  return Number.isNaN(time) ? null : time
}

/**
 * Validates a PAT by fetching the user it authenticates as. Throws on an
 * invalid token (401) or network failure - callers treat success as "token
 * works".
 */
export async function fetchGithubTokenMeta(token: string): Promise<GithubTokenMeta> {
  let res: Response
  try {
    res = await createGithubClient(token).request('/user')
  }
  catch (err) {
    throw err instanceof GithubApiError && err.status === 401 ? diagnostics.tokenRejected() : err
  }
  const user: { login: string, avatar_url: string, name: string | null } = await res.json()
  const scopesHeader = res.headers.get('x-oauth-scopes') ?? ''
  return {
    login: user.login,
    avatarUrl: user.avatar_url,
    name: user.name,
    scopes: scopesHeader.split(',').map(s => s.trim()).filter(Boolean),
    expiresAt: parseExpiration(res.headers.get('github-authentication-token-expiration')),
  }
}
