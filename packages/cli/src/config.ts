import type { LlmSettings, Locale, PullRequestRef } from '@pulls.review/core'
import { DEFAULT_LOCALE, defaultLlmSettings, deriveProvider, isLlmProvider, isLocale } from '@pulls.review/core'

export type Env = Record<string, string | undefined>

export interface Flags {
  provider?: string
  model?: string
  locale?: string
}

/** The first value that is set and not blank: an Action passes unset inputs as `''`. */
function first(...values: (string | undefined)[]): string | undefined {
  return values.find(value => value)
}

export function resolveGithubToken(env: Env): string {
  const token = first(env.PULLS_REVIEW_GITHUB_TOKEN, env.GITHUB_TOKEN)
  if (!token)
    throw new Error('A GitHub token is required: set GITHUB_TOKEN (or PULLS_REVIEW_GITHUB_TOKEN).')
  return token
}

/**
 * Flags win over `PULLS_REVIEW_*`, which win over each provider's conventional variable.
 * Without an explicit provider, the first conventional key found picks it, in the same
 * order Settings uses; `PULLS_REVIEW_API_KEY` alone means the default provider.
 */
export function resolveLlmSettings(env: Env, flags: Flags = {}): LlmSettings {
  const conventional = {
    gatewayToken: first(env.AI_GATEWAY_API_KEY),
    anthropicApiKey: first(env.ANTHROPIC_API_KEY),
    openaiApiKey: first(env.OPENAI_API_KEY),
  }
  const requested = first(flags.provider, env.PULLS_REVIEW_PROVIDER)
  if (requested !== undefined && !isLlmProvider(requested))
    throw new Error(`Unknown provider "${requested}": expected gateway, anthropic or openai-compatible.`)
  const provider = requested ?? deriveProvider(conventional)
  const apiKey = first(env.PULLS_REVIEW_API_KEY)
  const model = first(flags.model, env.PULLS_REVIEW_MODEL)

  const llm: LlmSettings = {
    ...defaultLlmSettings,
    provider,
    gatewayToken: conventional.gatewayToken ?? '',
    anthropicApiKey: conventional.anthropicApiKey ?? '',
    openaiApiKey: conventional.openaiApiKey ?? '',
    openaiBaseUrl: first(env.PULLS_REVIEW_BASE_URL, env.OPENAI_BASE_URL) ?? defaultLlmSettings.openaiBaseUrl,
  }
  switch (provider) {
    case 'gateway':
      return { ...llm, gatewayToken: apiKey ?? llm.gatewayToken, gatewayModel: model ?? llm.gatewayModel }
    case 'anthropic':
      return { ...llm, anthropicApiKey: apiKey ?? llm.anthropicApiKey, anthropicModel: model ?? llm.anthropicModel }
    case 'openai-compatible':
      return { ...llm, openaiApiKey: apiKey ?? llm.openaiApiKey, openaiModel: model ?? llm.openaiModel }
  }
}

export function resolveLocale(env: Env, flags: Flags = {}): Locale {
  const requested = first(flags.locale, env.PULLS_REVIEW_LOCALE)
  if (requested === undefined)
    return DEFAULT_LOCALE
  if (!isLocale(requested))
    throw new Error(`Unsupported locale "${requested}".`)
  return requested
}

/** The `pull_request` payload fields the target is read from; `GITHUB_EVENT_PATH` points at the JSON. */
export interface GithubEvent {
  pull_request?: { number: number }
}

/**
 * `owner/repo#123` or a github.com PR URL; in a workflow run, the PR the event is about.
 */
export function resolveTarget(arg: string | undefined, env: Env, event?: GithubEvent): PullRequestRef {
  if (arg) {
    const match = arg.match(/^(?:https:\/\/github\.com\/)?([^/\s]+)\/([^/#\s]+)(?:#|\/pull\/)(\d+)\/?$/)
    if (!match)
      throw new Error(`Cannot read a pull request from "${arg}": expected owner/repo#123 or a github.com pull request URL.`)
    return { owner: match[1]!, repo: match[2]!, number: match[3]! }
  }
  const [owner, repo] = env.GITHUB_REPOSITORY?.split('/') ?? []
  const number = event?.pull_request?.number
  if (!owner || !repo || number === undefined)
    throw new Error('No pull request given. Pass owner/repo#123, or run on a pull_request event in GitHub Actions.')
  return { owner, repo, number: String(number) }
}
