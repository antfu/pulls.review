import type { Env } from './env'
import { betterAuth } from 'better-auth'
import { symmetricEncrypt } from 'better-auth/crypto'
import { testUtils } from 'better-auth/plugins'
import { authOptions } from './auth'
import { testDatabase } from './db/testing'

/** Real auth sessions and encrypted accounts for service integration tests. */
export async function createAuthFixture(accessToken = 'access-token-for-test', githubUserId = 42) {
  const storage = testDatabase()
  const env: Env & { DB: typeof storage.db } = {
    DB: storage.db,
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'test-session-secret-at-least-32-bytes!!',
    CONFIG_ENCRYPTION_SECRET: 'config-secret-at-least-32-bytes!!!!!',
  }
  const auth = betterAuth({ ...authOptions(env, 'https://pulls.shyim.de'), plugins: [testUtils()] })
  env.AUTH = auth
  const context = await auth.$context
  const user = await context.test.saveUser(context.test.createUser({
    email: `${githubUserId}@github.invalid`,
    githubUserId,
    githubLogin: 'octocat',
    name: 'The Octocat',
  }))
  const account = await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'github',
    accountId: String(githubUserId),
    accessToken: await symmetricEncrypt({ key: env.SESSION_SECRET, data: accessToken }),
    refreshToken: await symmetricEncrypt({ key: env.SESSION_SECRET, data: 'ghr_refresh' }),
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
  })
  const { headers, session } = await context.test.login({ userId: user.id })
  return { env, auth, account, session, cookie: headers.get('cookie')!, storage, user }
}
