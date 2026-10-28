import type { LlmSettings } from './settings'
import { createGateway } from '@ai-sdk/gateway'

/** A selectable model from the active provider's catalog. */
export interface ModelOption {
  id: string
  name: string
  /** USD per 1M tokens. Only the gateway exposes pricing. */
  pricing?: { input: number, output: number }
}

async function listGatewayModels(apiKey: string): Promise<ModelOption[]> {
  const { models } = await createGateway({ apiKey }).getAvailableModels()
  return models
    // The gateway catalog also lists embedding/image/etc. models; only
    // language models can serve the analyze adapter.
    .filter(model => (model.modelType ?? 'language') === 'language')
    .map(model => ({
      id: model.id,
      name: model.name,
      // Gateway pricing is USD per single token; scale to per-1M for display.
      pricing: model.pricing
        ? { input: Number(model.pricing.input) * 1e6, output: Number(model.pricing.output) * 1e6 }
        : undefined,
    }))
}

async function listAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Same intended zero-backend flow as `model.ts`: the key is
      // user-supplied and never leaves this browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  })
  if (!res.ok)
    throw new Error(`Anthropic API request failed (${res.status})`)
  const json: { data: { id: string, display_name: string }[] } = await res.json()
  return json.data.map(model => ({ id: model.id, name: model.display_name }))
}

async function listOpenAiCompatibleModels(baseUrl: string, apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok)
    throw new Error(`Model list request failed (${res.status})`)
  const json: { data: { id: string }[] } = await res.json()
  return json.data.map(model => ({ id: model.id, name: model.id }))
}

/** Fetches the selected provider's model catalog with its configured credentials. */
export function listModels(llm: LlmSettings): Promise<ModelOption[]> {
  switch (llm.provider) {
    case 'gateway':
      return listGatewayModels(llm.gatewayToken)
    case 'anthropic':
      return listAnthropicModels(llm.anthropicApiKey)
    case 'openai-compatible':
      return listOpenAiCompatibleModels(llm.openaiBaseUrl, llm.openaiApiKey)
  }
}
