<script setup lang="ts">
import type { ModelOption } from '../../analyze/adapters/llm/list-models'
import type { LlmProvider, LlmSettings } from '../../state/settings'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'
import FormSegmentedControl from '@antfu/design/components/Form/FormSegmentedControl.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { computed, ref, watch } from 'vue'
import ModelPicker from './ModelPicker.vue'

const props = defineProps<{
  llmSettings: LlmSettings
  /** Catalog for the selected provider (from `useLlmModels`); `null` while absent. */
  models: ModelOption[] | null
  modelsLoading?: boolean
  modelsError?: string
  /** The GitHub-embedded view: github.com's CSP blocks the requests AI providers need, so the form is shown but disabled. */
  isEmbedded?: boolean
}>()

const emit = defineEmits<{
  'update:llmSettings': [value: LlmSettings]
}>()

interface ProviderConfig {
  tokenKey: 'gatewayToken' | 'anthropicApiKey' | 'openaiApiKey'
  modelKey: 'gatewayModel' | 'anthropicModel' | 'openaiModel'
  placeholder: string
}

const providerConfigs: Record<LlmProvider, ProviderConfig> = {
  'gateway': { tokenKey: 'gatewayToken', modelKey: 'gatewayModel', placeholder: 'vck_…' },
  'anthropic': { tokenKey: 'anthropicApiKey', modelKey: 'anthropicModel', placeholder: 'sk-ant-…' },
  'openai-compatible': { tokenKey: 'openaiApiKey', modelKey: 'openaiModel', placeholder: 'sk-…' },
}

const providerOptions = [
  { value: 'gateway', label: 'AI Gateway' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
]

const config = computed(() => providerConfigs[props.llmSettings.provider])
const token = computed(() => props.llmSettings[config.value.tokenKey])
const isOpenAi = computed(() => props.llmSettings.provider === 'openai-compatible')

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
  update({ [config.value.tokenKey]: '' })
  cancel()
}

const model = computed({
  get: () => props.llmSettings[config.value.modelKey],
  set: value => update({ [config.value.modelKey]: value }),
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
        <div class="text-sm color-base font-medium mb1 flex gap-1 items-center">
          <div class="i-ph-sparkle-duotone text-lg" />
          AI Analysis
        </div>
        <p class="text-sm color-faint">
          Configure a model provider to enable AI-generated summaries. Stored only in this browser and sent only to the provider you select.
        </p>
      </div>

      <FormField label="Provider">
        <FormSegmentedControl
          :options="providerOptions"
          :model-value="llmSettings.provider"
          @update:model-value="update({ provider: $event as LlmProvider })"
        />
      </FormField>

      <template v-if="!token || editing">
        <FormField v-if="isOpenAi" label="Base URL" description="Any OpenAI-compatible chat completions endpoint (OpenAI itself, a local server, etc.).">
          <FormTextInput
            v-model="draftBaseUrl"
            placeholder="https://api.openai.com/v1"
          />
        </FormField>

        <FormField label="API key">
          <div class="flex gap-2 items-center">
            <FormTextInput
              v-model="draftToken"
              type="password"
              icon="i-ph-key-duotone"
              :placeholder="config.placeholder"
              class="flex-1"
              @keyup.enter="draftToken && save()"
            />
            <ActionButton :disabled="!draftToken" @click="save">
              Save
            </ActionButton>
            <ActionButton v-if="editing" variant="text" @click="cancel">
              Cancel
            </ActionButton>
            <ActionButton v-if="editing" variant="text" @click="remove">
              Remove
            </ActionButton>
          </div>
          <template #description>
            <template v-if="llmSettings.provider === 'gateway'">
              A <a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noopener" class="hover:underline">Vercel AI Gateway</a> token, reaching any of its supported vendors with a single token.
            </template>
            <template v-else-if="llmSettings.provider === 'anthropic'">
              An <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" class="hover:underline">Anthropic API key</a>, called directly from this browser (no gateway).
            </template>
            <template v-else>
              The API key for the endpoint above.
            </template>
          </template>
        </FormField>
      </template>

      <template v-else>
        <FormField label="API key">
          <div class="text-sm px-3 border border-base rounded bg-raised flex gap-2 h-9 items-center">
            <span class="i-ph:check-circle-duotone color-active shrink-0" aria-hidden="true" />
            <span class="color-base">Configured</span>
            <span class="font-mono op-mute">••••{{ token.slice(-4) }}</span>
            <span v-if="isOpenAi" class="text-xs op-mute flex-1 truncate">{{ llmSettings.openaiBaseUrl }}</span>
            <span v-else class="flex-1" />
            <ActionIconButton
              icon="i-ph:pencil-simple-duotone"
              label="Change key"
              tooltip="Change key"
              compact
              class="text-sm"
              @click="editing = true"
            />
          </div>
        </FormField>

        <FormField label="Model">
          <ModelPicker
            v-model="model"
            :models="models"
            :loading="modelsLoading"
            :error="modelsError"
          />
          <template v-if="modelsError" #error>
            Could not load the model list ({{ modelsError }}). Enter a model id manually.
          </template>
        </FormField>
      </template>
    </div>

    <div
      v-if="isEmbedded"
      class="px-4 text-center flex flex-col gap-1 items-center inset-0 justify-center absolute"
    >
      <span class="i-ph:shield-warning-duotone text-2xl op-fade" aria-hidden="true" />
      <p class="text-sm color-base font-medium">
        AI features aren't available in embedded mode
      </p>
      <p class="text-xs color-faint max-w-72">
        github.com's strict Content Security Policy blocks the requests AI features need here.
        <a href="https://pulls.review" target="_blank" rel="noopener" class="color-base hover:underline">Go to the website</a> to use them.
      </p>
    </div>
  </div>
</template>
