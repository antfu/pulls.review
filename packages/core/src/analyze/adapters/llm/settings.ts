export type LlmProvider = 'gateway' | 'anthropic' | 'openai-compatible'

/**
 * The `llm` analyze adapter's model access. `provider` picks which credentials
 * and model to use - only the selected provider is ever called, even when
 * several tokens are configured.
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
}

/** Picks the provider from whichever credential is set, by priority (gateway > anthropic > openai-compatible). */
export function deriveProvider(llm: Partial<LlmSettings>): LlmProvider {
  if (llm.gatewayToken)
    return 'gateway'
  if (llm.anthropicApiKey)
    return 'anthropic'
  if (llm.openaiApiKey)
    return 'openai-compatible'
  return 'gateway'
}
