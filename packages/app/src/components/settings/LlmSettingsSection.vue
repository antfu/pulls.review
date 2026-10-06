<script setup lang="ts">
import type { KeyedLlmProvider, LlmProvider, LlmSettings, LocalAgentName } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { computed, ref, watch } from 'vue'
import { useLocalAgents } from '../../analyze/local-agents'
import ModelPicker from './ModelPicker.vue'

const props = defineProps<{
  llmSettings: LlmSettings
  /** Catalog for the selected provider (from `useLlmModels`); `null` while absent. */
  models: ModelOption[] | null
  modelsLoading?: boolean
  modelsError?: string
}>()

const emit = defineEmits<{
  'update:llmSettings': [value: LlmSettings]
}>()

// The GitHub-embedded build shows this form disabled: github.com's CSP blocks the
// requests AI providers need. Keyed off the compile-time `PR_EMBED` flag, not a prop.
const isEmbedded = import.meta.env.PR_EMBED

interface ProviderConfig {
  tokenKey: 'gatewayToken' | 'anthropicApiKey' | 'openaiApiKey'
  modelKey: 'gatewayModel' | 'anthropicModel' | 'openaiModel'
  placeholder: string
  createKey: { vendor: string, url: string }
}

const providerConfigs: Record<KeyedLlmProvider, ProviderConfig> = {
  'gateway': { tokenKey: 'gatewayToken', modelKey: 'gatewayModel', placeholder: 'vck_…', createKey: { vendor: 'Vercel', url: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys' } },
  'anthropic': { tokenKey: 'anthropicApiKey', modelKey: 'anthropicModel', placeholder: 'sk-ant-…', createKey: { vendor: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' } },
  'openai-compatible': { tokenKey: 'openaiApiKey', modelKey: 'openaiModel', placeholder: 'sk-…', createKey: { vendor: 'OpenAI', url: 'https://platform.openai.com/api-keys' } },
}

const providerOptions = [
  { value: 'gateway', label: 'AI Gateway', icon: 'i-simple-icons-vercel' },
  { value: 'anthropic', label: 'Anthropic', icon: 'i-simple-icons-claude' },
  { value: 'openai-compatible', label: 'OpenAI-compatible', icon: 'i-simple-icons-openai' },
  { value: 'local-agent', label: 'Local agent', icon: 'i-ph:terminal-window-duotone' },
]

/** The key-based providers' form; `undefined` for the local agent, which has an agent and a model instead. */
const config = computed(() => props.llmSettings.provider === 'local-agent' ? undefined : providerConfigs[props.llmSettings.provider])
const token = computed(() => config.value ? props.llmSettings[config.value.tokenKey] : '')
const isOpenAi = computed(() => props.llmSettings.provider === 'openai-compatible')

// Only the `pulls.review` CLI's build provides this; the site and the embed show the provider disabled.
const localAgents = useLocalAgents()
const agentOptions = computed(() => (localAgents?.agents.value ?? []).map(agent => ({ value: agent.name, label: `${agent.label} ${agent.version}` })))
const agentModel = computed({
  get: () => props.llmSettings.agentModel,
  set: value => update({ agentModel: value }),
})
/** One agent's model ids mean nothing to another: switching resets to its default. */
function pickAgent(agent: LocalAgentName) {
  update({ agent, agentModel: '' })
}

function update(patch: Partial<LlmSettings>) {
  emit('update:llmSettings', { ...props.llmSettings, ...patch })
}

const editing = ref(false)
// Both the key and the base URL commit on Save (not on type): the model-list
// fetch keys off them, and half-typed credentials would fire doomed requests.
const draftToken = ref('')
const draftBaseUrl = ref(props.llmSettings.openaiBaseUrl)

watch(() => props.llmSettings.provider, () => {
  editing.value = false
  draftToken.value = ''
  draftBaseUrl.value = props.llmSettings.openaiBaseUrl
})

function save() {
  if (!config.value)
    return
  const patch: Partial<LlmSettings> = { [config.value.tokenKey]: draftToken.value }
  if (isOpenAi.value)
    patch.openaiBaseUrl = draftBaseUrl.value
  update(patch)
  editing.value = false
  draftToken.value = ''
}

function cancel() {
  editing.value = false
  draftToken.value = ''
  draftBaseUrl.value = props.llmSettings.openaiBaseUrl
}

function remove() {
  if (config.value)
    update({ [config.value.tokenKey]: '' })
  cancel()
}

const model = computed({
  get: () => config.value ? props.llmSettings[config.value.modelKey] : '',
  set: value => config.value && update({ [config.value.modelKey]: value }),
})
</script>

<template>
  <div class="relative">
    <div
      class="flex flex-col gap-4 transition"
      :class="isEmbedded ? 'pointer-events-none opacity-40 blur-[2px] select-none' : ''"
      :inert="isEmbedded"
    >
      <div>
        <div class="mb1 flex items-center gap-1 text-sm color-base font-medium">
          <div class="i-ph-sparkle-duotone text-lg" />
          {{ $t('settings.llm.title') }}
        </div>
        <p class="text-sm color-faint">
          {{ $t('settings.llm.description') }}
        </p>
      </div>

      <FormField :label="$t('settings.llm.provider')">
        <ActionToggleGroup
          :model-value="llmSettings.provider"
          :options="providerOptions"
          @update:model-value="update({ provider: $event as LlmProvider })"
        />
      </FormField>

      <template v-if="!config">
        <FormField :label="$t('settings.llm.agent')">
          <p v-if="!localAgents" class="text-sm color-faint">
            {{ $t('settings.llm.agentNeedsCli') }}
          </p>
          <p v-else-if="!localAgents.agents.value" class="flex items-center gap-2 text-sm color-faint">
            <span class="i-ph:circle-notch animate-spin" aria-hidden="true" />
            {{ $t('settings.llm.agentDetecting') }}
          </p>
          <ActionToggleGroup
            v-else-if="agentOptions.length"
            :model-value="llmSettings.agent"
            :options="agentOptions"
            @update:model-value="pickAgent($event as LocalAgentName)"
          />
          <p v-else class="text-sm color-faint">
            {{ $t('settings.llm.agentNone') }}
          </p>
          <template #description>
            <i18n-t keypath="settings.llm.agentHint" scope="global">
              <template #claude>
                <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener" class="hover:underline">Claude Code</a>
              </template>
              <template #opencode>
                <a href="https://opencode.ai" target="_blank" rel="noopener" class="hover:underline">OpenCode</a>
              </template>
            </i18n-t>
          </template>
        </FormField>

        <FormField v-if="llmSettings.agent" :label="$t('settings.llm.model')">
          <ModelPicker
            v-model="agentModel"
            :models="models"
            :loading="modelsLoading"
            :error="modelsError"
          />
        </FormField>
      </template>

      <template v-else-if="!token || editing">
        <FormField v-if="isOpenAi" :label="$t('settings.llm.baseUrl')" :description="$t('settings.llm.baseUrlDescription')">
          <FormTextInput
            v-model="draftBaseUrl"
            placeholder="https://api.openai.com/v1"
          />
        </FormField>

        <FormField :label="$t('settings.llm.apiKey')">
          <div class="flex items-center gap-2">
            <FormTextInput
              v-model="draftToken"
              type="password"
              icon="i-ph-key-duotone"
              :placeholder="config?.placeholder"
              class="flex-1"
              @keyup.enter="draftToken && save()"
            />
            <ActionButton :disabled="!draftToken" @click="save">
              {{ $t('common.save') }}
            </ActionButton>
            <ActionButton v-if="editing" variant="text" @click="cancel">
              {{ $t('common.cancel') }}
            </ActionButton>
            <ActionButton v-if="editing" variant="text" @click="remove">
              {{ $t('common.remove') }}
            </ActionButton>
          </div>
          <template #description>
            <i18n-t v-if="llmSettings.provider === 'gateway'" keypath="settings.llm.gatewayHint" scope="global">
              <template #link>
                <a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noopener" class="hover:underline">Vercel AI Gateway</a>
              </template>
            </i18n-t>
            <i18n-t v-else-if="llmSettings.provider === 'anthropic'" keypath="settings.llm.anthropicHint" scope="global">
              <template #link>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" class="hover:underline">{{ $t('settings.llm.anthropicLink') }}</a>
              </template>
            </i18n-t>
            <template v-else>
              {{ $t('settings.llm.openaiHint') }}
            </template>
            <br><a
              v-if="config"
              :href="config.createKey.url"
              target="_blank"
              rel="noopener"
              class="text-primary hover:underline"
            >{{ $t('settings.llm.createKey', { provider: config.createKey.vendor }) }}</a>
          </template>
        </FormField>
      </template>

      <template v-else>
        <FormField :label="$t('settings.llm.apiKey')">
          <div class="h-9 flex items-center gap-2 border border-base rounded bg-raised px-3 text-sm">
            <span class="i-ph:check-circle-duotone shrink-0 color-active" aria-hidden="true" />
            <span class="color-base">{{ $t('settings.llm.configured') }}</span>
            <span class="font-mono op-mute">••••{{ token.slice(-4) }}</span>
            <span v-if="isOpenAi" class="flex-1 truncate text-xs op-mute">{{ llmSettings.openaiBaseUrl }}</span>
            <span v-else class="flex-1" />
            <ActionIconButton
              icon="i-ph:pencil-simple-duotone"
              :label="$t('settings.llm.changeKey')"
              :tooltip="$t('settings.llm.changeKey')"
              compact
              class="text-sm"
              @click="editing = true"
            />
          </div>
        </FormField>

        <FormField :label="$t('settings.llm.model')">
          <ModelPicker
            v-model="model"
            :models="models"
            :loading="modelsLoading"
            :error="modelsError"
          />
          <template v-if="modelsError" #error>
            {{ $t('settings.llm.modelListFailed', { error: modelsError }) }}
          </template>
        </FormField>
      </template>
    </div>

    <div
      v-if="isEmbedded"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
    >
      <span class="i-ph:shield-warning-duotone text-2xl op-fade" aria-hidden="true" />
      <p class="text-sm color-base font-medium">
        {{ $t('settings.llm.embedUnavailable') }}
      </p>
      <i18n-t keypath="settings.llm.embedReason" tag="p" class="max-w-72 text-xs color-faint" scope="global">
        <template #link>
          <a href="https://pulls.review" target="_blank" rel="noopener" class="color-base hover:underline">{{ $t('settings.llm.goToWebsite') }}</a>
        </template>
      </i18n-t>
    </div>
  </div>
</template>
