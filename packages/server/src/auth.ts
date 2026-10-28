import type { BetterAuthOptions } from 'better-auth'
import type { Database } from './db/client'
import type { Env } from './env'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import * as schema from './db/schema'

/** GitHub identity and a current token, available only inside server services. */
export interface AuthSession {
  userId: number
  login: string
  avatarUrl: string
  name: string | null
  accessToken: string
}

export function authOptions(env: Env & { DB: Database }, origin: string) {
  return {
    appName: 'Diffwise',
    advanced: { disableOriginCheck: false },
    baseURL: origin,
    secret: env.SESSION_SECRET,
    database: drizzleAdapter(env.DB, { provider: 'sqlite', schema }),
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        // Keep existing GitHub App registrations working during the migration.
        redirectURI: `${origin}/api/auth/callback`,
        disableDefaultScope: true,
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: profile => ({
          githubUserId: profile.id,
          githubLogin: profile.login,
          // Identity is GitHub's immutable id. We don't need email permissions.
          email: `${profile.id}@github.invalid`,
          emailVerified: false,
        }),
      },
    },
    user: {
      // Provider mapping uses input validation; /update-user is disabled below.
      additionalFields: {
        githubUserId: { type: 'number', required: true },
        githubLogin: { type: 'string', required: true },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
    },
    session: { expiresIn: 60 * 60 * 24 * 180 },
    // Provider credentials are exclusively consumed by server-side auth.api calls.
    disabledPaths: ['/get-access-token', '/refresh-token', '/account-info', '/update-user', '/link-social'],
    onAPIError: { errorURL: '/?auth=error' },
  } satisfies BetterAuthOptions
}

export function createAuth(env: Env & { DB: Database }, origin: string) {
  return betterAuth(authOptions(env, origin))
}

export type Auth = ReturnType<typeof createAuth>

export async function readSession(request: Request, env: Env): Promise<AuthSession | null> {
  if (!env.AUTH)
    return null
  const session = await env.AUTH.api.getSession({ headers: request.headers })
  if (!session)
    return null
  const accounts = await env.AUTH.api.listUserAccounts({ headers: request.headers })
  const account = accounts.find(account => account.providerId === 'github')
  if (!account)
    return null
  try {
    const { accessToken } = await env.AUTH.api.getAccessToken({
      headers: request.headers,
      body: { accountId: account.id },
    })
    if (!accessToken)
      return null
    return {
      userId: session.user.githubUserId,
      login: session.user.githubLogin,
      avatarUrl: session.user.image ?? '',
      name: session.user.name,
      accessToken,
    }
  }
  catch {
    return null
  }
}
