import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { ResolvedModel } from './model'
import { createModels, createProvider } from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

/**
 * Browser CORS preflights fail on headers the endpoint does not allow-list: the SDKs'
 * x-stainless-* telemetry is rejected by the Vercel AI Gateway and most OpenAI-compatible
 * servers, and the gateway also rejects Anthropic's direct-browser-access opt-in.
 */
export function createCorsSafeFetch(provider: string): typeof fetch {
  const stripBrowserAccess = provider === 'vercel-ai-gateway'
  return (input, init) => {
    const headers = new Headers(init?.headers)
    for (const name of [...headers.keys()]) {
      if (name.startsWith('x-stainless-') || (stripBrowserAccess && name === 'anthropic-dangerous-direct-browser-access'))
        headers.delete(name)
    }
    return fetch(input, { ...init, headers })
  }
}

export function createStreamFn(resolved: ResolvedModel): StreamFn {
  const models = createModels()
  models.setProvider(createProvider({
    id: resolved.model.provider,
    auth: { apiKey: { name: 'API key', resolve: async () => ({ auth: { apiKey: resolved.apiKey } }) } },
    models: [resolved.model],
    api: {
      'anthropic-messages': anthropicMessagesApi(),
      'openai-completions': openAICompletionsApi(),
    },
  }))
  const corsSafeFetch = createCorsSafeFetch(resolved.model.provider)
  return (model, context, options) => models.streamSimple(model, context, { ...options, fetch: corsSafeFetch })
}
