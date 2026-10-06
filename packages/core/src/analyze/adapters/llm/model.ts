import type { Api, Model } from '@earendil-works/pi-ai'
import type { LlmSettings } from './settings'

export interface ResolvedModel {
  model: Model<Api>
  apiKey: string
}

function customModel(id: string, api: Api, provider: string, baseUrl: string): Model<Api> {
  return {
    id,
    name: id,
    api,
    provider,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
  }
}

/**
 * Resolves the model to call: only the explicitly selected provider is used,
 * even when several tokens are configured. `undefined` means the selected
 * provider has no token - or is a local agent, which is never called directly.
 */
export function resolveModel(llm: LlmSettings): ResolvedModel | undefined {
  switch (llm.provider) {
    case 'local-agent':
      return undefined

    case 'gateway':
      return llm.gatewayToken
        ? { model: customModel(llm.gatewayModel, 'anthropic-messages', 'vercel-ai-gateway', 'https://ai-gateway.vercel.sh'), apiKey: llm.gatewayToken }
        : undefined

    case 'anthropic':
      return llm.anthropicApiKey
        ? { model: customModel(llm.anthropicModel, 'anthropic-messages', 'anthropic', 'https://api.anthropic.com'), apiKey: llm.anthropicApiKey }
        : undefined

    case 'openai-compatible':
      return llm.openaiApiKey
        ? { model: customModel(llm.openaiModel, 'openai-completions', 'openai-compatible', llm.openaiBaseUrl), apiKey: llm.openaiApiKey }
        : undefined
  }
}
