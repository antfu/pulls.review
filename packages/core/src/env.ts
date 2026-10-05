import type { LlmSettings } from './analyze/adapters/llm/settings'
import { defaultLlmSettings, deriveProvider, isLlmProvider } from './analyze/adapters/llm/settings'

/** Settings from a process environment, shared by every Node entry point (the CLI, a local server). */
export type Env = Record<string, string | undefined>

/** The first value that is set and not blank: an Action passes unset inputs as `''`. */
function first(...values: (string | undefined)[]): string | undefined {
  return values.find(value => value)
}

export function githubTokenFromEnv(env: Env): string | undefined {
  return first(env.PULLS_REVIEW_GITHUB_TOKEN, env.GITHUB_TOKEN)
}

/**
 * Explicit overrides (CLI flags) win over `PULLS_REVIEW_*`, which win over each provider's conventional variable.
 * Without an explicit provider, the first conventional key found picks it, in the same
 * order Settings uses; `PULLS_REVIEW_API_KEY` alone means the default provider.
 */
export function llmSettingsFromEnv(env: Env, flags: { provider?: string, model?: string } = {}): LlmSettings {
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
