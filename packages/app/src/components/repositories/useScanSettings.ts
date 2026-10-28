import type { LlmProvider } from '@pulls.review/core/analyze'
import type { HostConfig, ScanConfig, ScanRuns, ScanSettings } from './api'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { api, scanPath } from './api'

const PROVIDER_FIELDS = {
  'gateway': { model: 'gatewayModel', key: 'gatewayToken', stored: 'hasGatewayToken' },
  'anthropic': { model: 'anthropicModel', key: 'anthropicApiKey', stored: 'hasAnthropicKey' },
  'openai-compatible': { model: 'openaiModel', key: 'openaiApiKey', stored: 'hasOpenaiKey' },
} as const

function makeDraft(config?: ScanConfig | null) {
  return {
    enabled: config?.enabled ?? false,
    includeDrafts: config?.includeDrafts ?? false,
    publishCheckRun: config?.publishCheckRun ?? true,
    budget: config?.monthlyBudgetRuns === null ? '' : String(config?.monthlyBudgetRuns ?? 100),
    excludePaths: config?.excludePaths.join('\n') ?? '',
    locale: config?.locale ?? 'en',
    llm: { ...defaultUserConfig().settings.llm, ...config?.llm },
  }
}

export function useScanSettings(owner: string, repo: string) {
  const path = scanPath(owner, repo)
  const controller = new AbortController()
  onScopeDispose(() => controller.abort())
  const settings = shallowRef<ScanSettings>()
  const runs = shallowRef<ScanRuns>()
  const host = shallowRef<HostConfig>()
  const connection = shallowRef<{ installed: boolean, suspended: boolean, archived: boolean }>()
  const loading = ref(true)
  const saving = ref(false)
  const error = ref('')
  const saved = ref(false)
  const forbidden = ref(false)
  const draft = ref(makeDraft())
  const apiKey = ref('')
  const baseline = ref(JSON.stringify(draft.value))
  const snapshot = () => JSON.stringify(draft.value)
  const dirty = computed(() => snapshot() !== baseline.value || !!apiKey.value)
  const fields = computed(() => PROVIDER_FIELDS[draft.value.llm.provider])
  const model = computed({
    get: () => draft.value.llm[fields.value.model],
    set: (value: string) => {
      draft.value.llm[fields.value.model] = value
    },
  })
  const storedKey = computed(() => !!settings.value?.config?.llm[fields.value.stored])
  const ready = computed(() => !!connection.value?.installed && !connection.value.suspended && !connection.value.archived && host.value?.webhook === true)
  const valid = computed(() => (!draft.value.enabled || (ready.value && !!model.value.trim() && (storedKey.value || !!apiKey.value.trim())))
    && (draft.value.budget === '' || (Number.isInteger(Number(draft.value.budget)) && Number(draft.value.budget) >= 1 && Number(draft.value.budget) <= 100_000)))

  watch(() => draft.value.llm.provider, () => {
    apiKey.value = ''
  }, { flush: 'sync' })
  watch(dirty, (value) => {
    if (value)
      saved.value = false
  })

  function accept(value: ScanSettings) {
    settings.value = value
    draft.value = makeDraft(value.config ?? value.inherited)
    apiKey.value = ''
    baseline.value = snapshot()
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const options = { signal: controller.signal }
      const [config, history, capabilities, connected] = await Promise.all([
        api<ScanSettings>(path, options),
        api<ScanRuns>(`${path}/jobs`, options),
        api<HostConfig>('/api/config', options),
        api<{ installed: boolean, suspended: boolean, archived: boolean }>(`/api/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, options),
      ])
      accept(config)
      runs.value = history
      host.value = capabilities
      connection.value = connected
      forbidden.value = false
    }
    catch (cause) {
      if (!controller.signal.aborted) {
        forbidden.value = (cause as { status?: number }).status === 403
        error.value = 'load'
      }
    }
    finally {
      if (!controller.signal.aborted)
        loading.value = false
    }
  }

  async function refreshRuns() {
    try {
      runs.value = await api<ScanRuns>(`${path}/jobs`, { signal: controller.signal })
      error.value = ''
    }
    catch {
      if (!controller.signal.aborted)
        error.value = 'history'
    }
  }

  async function save() {
    if (!valid.value || saving.value)
      return
    saving.value = true
    error.value = ''
    try {
      const value = await api<{ config: ScanConfig }>(path, {
        method: 'PUT',
        body: {
          enabled: draft.value.enabled,
          includeDrafts: draft.value.includeDrafts,
          publishCheckRun: draft.value.publishCheckRun,
          monthlyBudgetRuns: draft.value.budget === '' ? null : Number(draft.value.budget),
          excludePaths: draft.value.excludePaths.split('\n').map(path => path.trim()).filter(Boolean),
          locale: draft.value.locale,
          llm: {
            provider: draft.value.llm.provider,
            [fields.value.model]: model.value.trim(),
            openaiBaseUrl: draft.value.llm.openaiBaseUrl,
            ...(apiKey.value.trim() ? { [fields.value.key]: apiKey.value.trim() } : {}),
          },
        },
        signal: controller.signal,
      })
      accept({ ...settings.value!, config: value.config })
      saved.value = true
      await refreshRuns()
    }
    catch {
      if (!controller.signal.aborted)
        error.value = 'save'
    }
    finally {
      saving.value = false
    }
  }

  async function inherit() {
    saving.value = true
    error.value = ''
    try {
      await api(path, { method: 'DELETE', signal: controller.signal })
      await load()
      saved.value = true
    }
    catch {
      if (!controller.signal.aborted)
        error.value = 'save'
    }
    finally {
      saving.value = false
    }
  }

  const provider = computed({
    get: () => draft.value.llm.provider,
    set: (value: LlmProvider) => {
      draft.value.llm.provider = value
    },
  })
  return { settings, runs, connection, host, loading, saving, error, saved, forbidden, draft, apiKey, dirty, model, storedKey, ready, valid, provider, load, save, inherit, refreshRuns }
}
