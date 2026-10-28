import type { AuthSession } from './auth'
import type { Database } from './db/client'
import type { Env } from './env'
import { sanitizeUserConfig } from '@pulls.review/core/user-config'
import { sql } from 'drizzle-orm'
import { readSession } from './auth'
import { sealJson, unsealJson } from './encryption'
import { json } from './http'

const MAX_BODY_BYTES = 65_536

export interface StoredUserConfig {
  githubLogin: string
  ciphertext: string
  updatedAt: number
}

export interface UserConfigRepository {
  putIfUnchanged?: (githubUserId: number, record: StoredUserConfig, baseUpdatedAt: number | null) => Promise<boolean>
  get: (githubUserId: number) => Promise<StoredUserConfig | null>
  put: (githubUserId: number, record: StoredUserConfig) => Promise<void>
  delete: (githubUserId: number) => Promise<void>
}

interface UserConfigRow {
  github_login: string
  ciphertext: string
  updated_at: number
}

export function createSqliteUserConfigRepository(db: Database): UserConfigRepository {
  return {
    async putIfUnchanged(githubUserId, record, baseUpdatedAt) {
      if (baseUpdatedAt === null) {
        return db.run(sql`INSERT INTO user_config (github_user_id, github_login, ciphertext, updated_at)
          VALUES (${githubUserId}, ${record.githubLogin}, ${record.ciphertext}, ${record.updatedAt})
          ON CONFLICT(github_user_id) DO NOTHING`).changes === 1
      }
      return db.run(sql`UPDATE user_config SET github_login = ${record.githubLogin}, ciphertext = ${record.ciphertext}, updated_at = ${record.updatedAt}
        WHERE github_user_id = ${githubUserId} AND updated_at = ${baseUpdatedAt}`).changes === 1
    },
    async get(githubUserId) {
      const row = db.get<UserConfigRow>(sql`SELECT github_login, ciphertext, updated_at FROM user_config WHERE github_user_id = ${githubUserId}`)
      return row
        ? { githubLogin: row.github_login, ciphertext: row.ciphertext, updatedAt: row.updated_at }
        : null
    },
    async put(githubUserId, record) {
      db.run(sql`INSERT INTO user_config (github_user_id, github_login, ciphertext, updated_at)
          VALUES (${githubUserId}, ${record.githubLogin}, ${record.ciphertext}, ${record.updatedAt})
          ON CONFLICT(github_user_id) DO UPDATE SET
            github_login = excluded.github_login,
            ciphertext = excluded.ciphertext,
            updated_at = excluded.updated_at`)
    },
    async delete(githubUserId) {
      db.run(sql`DELETE FROM user_config WHERE github_user_id = ${githubUserId}`)
    },
  }
}

export interface UserConfigDeps {
  repository?: UserConfigRepository
  now?: () => number
}

function encryptionSecret(env: Env): string {
  return `${env.CONFIG_ENCRYPTION_SECRET || env.SESSION_SECRET}\0pulls.review:user-config:v1`
}

export async function authenticateGitHubUser(
  request: Request,
  env: Env,
): Promise<{ session: AuthSession, userId: number, headers: Headers } | Response> {
  const session = await readSession(request, env)
  if (!session)
    return json({ error: 'unauthorized' }, 401)
  return { session, userId: session.userId, headers: new Headers() }
}

async function decryptConfig(row: StoredUserConfig, env: Env) {
  const value = await unsealJson<unknown>(row.ciphertext, encryptionSecret(env))
  return sanitizeUserConfig(value)
}

/** Load and decrypt one user's synced config for other server services. */
export async function loadUserConfig(
  env: Env,
  githubUserId: number,
  repository?: UserConfigRepository,
) {
  const store = repository ?? (env.DB ? createSqliteUserConfigRepository(env.DB) : undefined)
  if (!store)
    return null
  const stored = await store.get(githubUserId)
  return stored ? decryptConfig(stored, env) : null
}

/**
 * Encrypted per-GitHub-user app configuration. `baseUpdatedAt` provides
 * optimistic concurrency so a stale browser cannot silently overwrite a
 * newer config from another browser.
 */
export async function handleUserConfig(
  request: Request,
  env: Env,
  deps: UserConfigDeps = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/user-config')
    return null
  if (!['GET', 'PUT', 'DELETE'].includes(request.method))
    return json({ error: 'method not allowed' }, 405)
  if (!env.DB && !deps.repository)
    return json({ error: 'User config storage is not configured on this host.' }, 503)

  const repository = deps.repository ?? createSqliteUserConfigRepository(env.DB!)
  const auth = await authenticateGitHubUser(request, env)
  if (auth instanceof Response)
    return auth

  if (request.method === 'DELETE') {
    await repository.delete(auth.userId)
    return json({ ok: true }, 200, auth.headers)
  }

  const stored = await repository.get(auth.userId)

  if (request.method === 'GET') {
    if (!stored)
      return json({ config: null, updatedAt: null }, 200, auth.headers)
    const config = await decryptConfig(stored, env)
    if (!config)
      return json({ error: 'Stored user config could not be decrypted.' }, 500, auth.headers)
    return json({ config, updatedAt: stored.updatedAt }, 200, auth.headers)
  }

  return putUserConfig(request, env, repository, auth, stored, deps.now ? deps.now() : Date.now())
}

async function putUserConfig(
  request: Request,
  env: Env,
  repository: UserConfigRepository,
  auth: { session: AuthSession, userId: number, headers: Headers },
  stored: StoredUserConfig | null,
  now: number,
): Promise<Response> {
  const bodyText = await request.text()
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES)
    return json({ error: 'User config is too large.' }, 413, auth.headers)

  let payload: { config?: unknown, baseUpdatedAt?: unknown }
  try {
    payload = JSON.parse(bodyText) as { config?: unknown, baseUpdatedAt?: unknown }
  }
  catch {
    return json({ error: 'Invalid JSON.' }, 400, auth.headers)
  }

  const config = sanitizeUserConfig(payload.config)
  if (!config)
    return json({ error: 'Invalid user config.' }, 400, auth.headers)

  const baseUpdatedAt = payload.baseUpdatedAt === null || typeof payload.baseUpdatedAt === 'number'
    ? payload.baseUpdatedAt
    : undefined
  if (baseUpdatedAt === undefined)
    return json({ error: 'baseUpdatedAt is required.' }, 400, auth.headers)
  if ((stored?.updatedAt ?? null) !== baseUpdatedAt) {
    const current = stored ? await decryptConfig(stored, env) : null
    return json({ error: 'config_conflict', config: current, updatedAt: stored?.updatedAt ?? null }, 409, auth.headers)
  }

  const updatedAt = Math.max(now, (stored?.updatedAt ?? 0) + 1)
  const record = {
    githubLogin: auth.session.login,
    ciphertext: await sealJson(config, encryptionSecret(env)),
    updatedAt,
  }
  if (repository.putIfUnchanged) {
    if (!await repository.putIfUnchanged(auth.userId, record, baseUpdatedAt)) {
      const latest = await repository.get(auth.userId)
      return json({ error: 'config_conflict', config: latest ? await decryptConfig(latest, env) : null, updatedAt: latest?.updatedAt ?? null }, 409, auth.headers)
    }
  }
  else {
    await repository.put(auth.userId, record)
  }
  return json({ config, updatedAt }, 200, auth.headers)
}
