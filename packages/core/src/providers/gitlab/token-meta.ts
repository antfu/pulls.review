import { diagnostics } from '../../diagnostics'
import { createGitlabClient, GitlabApiError } from './client'

/** Who a personal access token authenticates as, plus what the token itself can do and until when. */
export interface GitlabTokenMeta {
  login: string
  avatarUrl: string
  name: string | null
  /** The token's scopes; empty when GitLab won't describe the token (it is not a personal access token). */
  scopes: string[]
  /** Token expiration (ms epoch), `null` when the token never expires or GitLab won't say. */
  expiresAt: number | null
}

/**
 * Validates a token by fetching the user it authenticates as. Throws on an invalid
 * token (401) or network failure - callers treat success as "token works".
 */
export async function fetchGitlabTokenMeta(host: string, token: string): Promise<GitlabTokenMeta> {
  const client = createGitlabClient(host, { githubToken: async () => undefined, gitlabToken: async () => token })
  let user: { username: string, avatar_url: string | null, name: string | null }
  try {
    user = await (await client.request('/user')).json()
  }
  catch (err) {
    throw err instanceof GitlabApiError && err.status === 401 ? diagnostics.tokenRejected({ provider: 'GitLab' }) : err
  }
  // Only a personal access token can describe itself; the user above is enough to go on without it.
  const self: { scopes?: string[], expires_at?: string | null } = await client.request('/personal_access_tokens/self').then(res => res.json(), () => ({}))
  return {
    login: user.username,
    avatarUrl: user.avatar_url ?? '',
    name: user.name,
    scopes: self.scopes ?? [],
    expiresAt: self.expires_at ? Date.parse(self.expires_at) : null,
  }
}
