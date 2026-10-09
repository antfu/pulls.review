export const LLM_PROVIDERS = ['gateway', 'anthropic', 'openai-compatible', 'local-agent'] as const
export type LlmProvider = typeof LLM_PROVIDERS[number]

export function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value)
}

/** The providers called with a key, from the browser or CI. */
export type KeyedLlmProvider = Exclude<LlmProvider, 'local-agent'>

/** The agent CLIs the `pulls.review` server can run analysis through (`plans/11-local-agents.md`). */
export const LOCAL_AGENT_NAMES = ['claude', 'opencode', 'pi', 'codex'] as const
export type LocalAgentName = typeof LOCAL_AGENT_NAMES[number]

export function isLocalAgentName(value: string): value is LocalAgentName {
  return (LOCAL_AGENT_NAMES as readonly string[]).includes(value)
}

/**
 * The `llm` analyze adapter's model access. `provider` picks which credentials
 * and model to use - only the selected provider is ever called, even when
 * several tokens are configured. `local-agent` needs no key: the `pulls.review`
 * server runs the chosen agent CLI, signed in on its own.
 */
export interface LlmSettings {
  provider: LlmProvider
  gatewayToken: string
  gatewayModel: string
  anthropicApiKey: string
  anthropicModel: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  /** `''` until the user picks one. */
  agent: LocalAgentName | ''
  /** `''` = the agent's own default model. */
  agentModel: string
}

export const defaultLlmSettings: LlmSettings = {
  provider: 'gateway',
  gatewayToken: '',
  gatewayModel: 'anthropic/claude-sonnet-5',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-5',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-5.1',
  agent: '',
  agentModel: '',
}

/** Picks the provider from whichever credential is set, by priority (gateway > anthropic > openai-compatible). */
export function deriveProvider(llm: Partial<LlmSettings>): KeyedLlmProvider {
  if (llm.gatewayToken)
    return 'gateway'
  if (llm.anthropicApiKey)
    return 'anthropic'
  if (llm.openaiApiKey)
    return 'openai-compatible'
  return 'gateway'
}
