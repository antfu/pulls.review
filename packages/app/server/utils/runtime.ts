import type { Env } from '@pulls.review/server/env'
import { resolve } from 'node:path'
import process from 'node:process'
import { createAuth } from '@pulls.review/server/auth'
import { openDatabase } from '@pulls.review/server/db/client'
import { createJobRunner } from '@pulls.review/server/jobs/runner'

export function createRuntime() {
  if (process.env.PUBLIC_ORIGIN) {
    const origin = new URL(process.env.PUBLIC_ORIGIN)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment')
  }
  if (process.env.NODE_ENV === 'production' && process.env.GITHUB_CLIENT_ID && !process.env.PUBLIC_ORIGIN)
    throw new Error('PUBLIC_ORIGIN is required for production OAuth')

  const storage = openDatabase(
    process.env.DATABASE_PATH || resolve('data/pulls-review.sqlite'),
    process.env.MIGRATIONS_PATH || resolve('../server/migrations'),
  )
  const env: Env & { DB: typeof storage.db } = {
    ...process.env,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    DB: storage.db,
  }
  if (env.GITHUB_CLIENT_ID && env.SESSION_SECRET.length < 32) {
    storage.close()
    throw new Error('SESSION_SECRET must contain at least 32 characters when OAuth is configured')
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
    env.AUTH = createAuth(env, process.env.PUBLIC_ORIGIN || 'http://localhost:3000')
  const runner = createJobRunner(env)
  return { env, storage, runner }
}

let runtime: ReturnType<typeof createRuntime> | undefined
export function getRuntime() {
  runtime ??= createRuntime()
  return runtime
}
