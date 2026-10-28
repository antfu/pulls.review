import type { Auth } from './auth'
import type { Database } from './db/client'
/**
 * Whose LLM settings pay for a server-side analysis. Jobs without a source
 * are treated as `global` for backwards compatibility with queued webhooks.
 */
export type AnalysisConfigSource
  = | { type: 'global' }
    | { type: 'user', githubUserId: number }
    | { type: 'repository', owner: string, repo: string }
    | { type: 'organization', owner: string }

/** A pull request queued for server-side analysis (webhook or manual trigger). */
export interface AnalysisJob {
  owner: string
  repo: string
  number: number
  installationId?: number
  headSha?: string
  configSource?: AnalysisConfigSource
  /** Durable SQLite control-plane identity; absent on legacy queued messages. */
  jobId?: string
}

/** Server configuration and persistence dependencies. */
export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  SESSION_SECRET: string
  CONFIG_ENCRYPTION_SECRET?: string
  AUTH?: Pick<Auth, 'api' | 'handler'>
  DB?: Database
  GITHUB_APP_ID?: string
  /** PKCS#8 PEM private key; literal `\n` escapes are accepted. */
  GITHUB_APP_PRIVATE_KEY?: string
  GITHUB_APP_SLUG?: string
  GITHUB_WEBHOOK_SECRET?: string
  AI_GATEWAY_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  PULLS_REVIEW_API_KEY?: string
  PULLS_REVIEW_PROVIDER?: string
  PULLS_REVIEW_MODEL?: string
  PULLS_REVIEW_LOCALE?: string
  PULLS_REVIEW_BASE_URL?: string
}
