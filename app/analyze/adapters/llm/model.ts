import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { settings } from '../../../state/settings'

/**
 * Resolves the model to call from Settings: only the explicitly selected
 * provider is used, even when several tokens are configured. `undefined` means
 * the selected provider has no token - the adapter's `available`.
 */
export function resolveLanguageModel(): LanguageModel | undefined {
  const llm = settings.value.llm

  switch (llm.provider) {
    case 'gateway':
      return llm.gatewayToken
        ? createGateway({ apiKey: llm.gatewayToken })(llm.gatewayModel)
        : undefined

    case 'anthropic':
      return llm.anthropicApiKey
        ? createAnthropic({
            apiKey: llm.anthropicApiKey,
            // Anthropic's API otherwise rejects browser-origin requests outright (CORS).
            // The key is user-supplied and never leaves this browser - this is the
            // intended zero-backend flow, not a workaround for a mistake.
            headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
          })(llm.anthropicModel)
        : undefined

    case 'openai-compatible':
      return llm.openaiApiKey
        ? createOpenAICompatible({
            name: 'openai-compatible',
            baseURL: llm.openaiBaseUrl,
            apiKey: llm.openaiApiKey,
          }).chatModel(llm.openaiModel)
        : undefined
  }
}
