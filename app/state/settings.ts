import { useLocalStorage } from '@vueuse/core'

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

export interface Settings {
  githubToken: string
  llm: LlmSettings
}

const defaultSettings: Settings = {
  githubToken: '',
  llm: defaultLlmSettings,
}

/**
 * Settings stored before `provider` existed picked a provider by priority
 * (gateway > anthropic > openai-compatible); seed the explicit selection from
 * the same order so existing setups keep working unchanged.
 */
function deriveProvider(llm: Partial<LlmSettings>): LlmProvider {
  if (llm.gatewayToken)
    return 'gateway'
  if (llm.anthropicApiKey)
    return 'anthropic'
  if (llm.openaiApiKey)
    return 'openai-compatible'
  return 'gateway'
}

/**
 * Every setting lives under one localStorage key - needs synchronous access before a
 * provider call, so localStorage over unstorage/IndexedDB. A plain module-level
 * singleton (like `state/dark.ts`'s `isDark`) - every caller shares the same value.
 */
export const settings = useLocalStorage<Settings>('diffs:settings', defaultSettings, {
  mergeDefaults: (storage, defaults) => {
    const llm: LlmSettings = { ...defaults.llm, ...storage?.llm }
    if (!storage?.llm?.provider)
      llm.provider = deriveProvider(llm)
    return { ...defaults, ...storage, llm }
  },
})
