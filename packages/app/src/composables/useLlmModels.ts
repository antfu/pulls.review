import type { LlmProvider, LlmSettings } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'
import type { Ref } from 'vue'
import { listModels } from '@pulls.review/core/llm'
import { onScopeDispose, ref, watch } from 'vue'
import { useLocalAgents } from '../analyze/local-agents'
import { sha256Hex } from '../cache/token-hash'
import { t } from '../i18n'
import { settings } from '../state/settings'

/** The selected provider's configured token/key ('' when unset). */
export function llmToken(llm: LlmSettings): string {
  switch (llm.provider) {
    case 'gateway':
      return llm.gatewayToken
    case 'anthropic':
      return llm.anthropicApiKey
    case 'openai-compatible':
      return llm.openaiApiKey
    case 'local-agent':
      // Needs no key; its catalog comes from the `pulls.review` server (`useLocalAgents`).
      return ''
  }
}

/**
 * The secret material a provider's model list depends on - when its hash
 * matches the cached one, the cached list is reused instead of refetching.
 */
function llmCredentials(llm: LlmSettings): string {
  // The base URL changes which catalog an OpenAI-compatible `/models` serves.
  const baseUrl = llm.provider === 'openai-compatible' ? `${llm.openaiBaseUrl}\n` : ''
  return baseUrl + llmToken(llm)
}

interface ModelsCacheEntry {
  hash: string
  models: ModelOption[]
}

type ModelsCache = Partial<Record<LlmProvider, ModelsCacheEntry>>

const STORAGE_KEY = 'diffs:llm-models'

function readCache(): ModelsCache {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw)
    return {}
  try {
    return JSON.parse(raw)
  }
  catch {
    return {}
  }
}

export interface UseLlmModelsReturn {
  /** Catalog for the selected provider; `null` while no credentials, loading, or failed. */
  models: Ref<ModelOption[] | null>
  loading: Ref<boolean>
  error: Ref<string | undefined>
}

/**
 * The selected provider's model catalog, fetched once per credential set and
 * cached in localStorage keyed by the credentials' hash.
 */
export function useLlmModels(): UseLlmModelsReturn {
  const models = ref<ModelOption[] | null>(null)
  const loading = ref(false)
  const error = ref<string>()

  // Compile-time: a build without LLM support (the embed) has no use for a catalog,
  // and skipping the fetch here is what keeps `@ai-sdk/gateway` out of its bundle.
  if (!import.meta.env.PR_LLM)
    return { models, loading, error }

  const localAgents = useLocalAgents()

  // Stopping the scope stops the watcher, but not an async callback already
  // suspended at an await - invalidate those instead of fetching/writing for
  // a dead owner.
  let requestId = 0
  onScopeDispose(() => {
    requestId++
  })

  /** A local agent's catalog came with the server's agent list, headed by the agent's own default. */
  const agentModels = () => {
    const found = localAgents?.value?.find(agent => agent.name === settings.value.llm.agent)
    return found ? [{ id: '', name: t('settings.models.agentDefault') }, ...found.models] : null
  }

  watch(() => [settings.value.llm.provider, settings.value.llm.agent, llmCredentials(settings.value.llm), localAgents?.value] as const, async ([provider]) => {
    const id = ++requestId
    models.value = null
    error.value = undefined
    if (provider === 'local-agent') {
      models.value = agentModels()
      return
    }
    if (!llmToken(settings.value.llm))
      return
    const credentials = llmCredentials(settings.value.llm)
    loading.value = true
    try {
      const hash = await sha256Hex(credentials)
      if (id !== requestId)
        return
      const cached = readCache()[provider]
      const list = cached?.hash === hash
        ? cached.models
        : await listModels(settings.value.llm)
      if (id !== requestId)
        return
      if (cached?.hash !== hash) {
        const cache: ModelsCache = { ...readCache(), [provider]: { hash, models: list } }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
      }
      models.value = list
    }
    catch (err) {
      if (id === requestId)
        error.value = err instanceof Error ? err.message : String(err)
    }
    finally {
      if (id === requestId)
        loading.value = false
    }
  }, { immediate: true })

  return { models, loading, error }
}
