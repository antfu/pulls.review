<script setup lang="ts">
import type { LlmSettings, LocalAgentName } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'
import FormField from '@antfu/design/components/Form/FormField.vue'
import { SelectContent, SelectIcon, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from 'reka-ui'
import { computed, useTemplateRef } from 'vue'
import { useLocalAgents } from '../../analyze/local-agents'
import ModelPicker from './ModelPicker.vue'

/**
 * The "Local agent" provider's form (`plans/11-local-agents.md`): which agent CLI the
 * `pulls.review` server runs, and which of its models. Only the `PR_LOCAL` build renders
 * it, so the agent list it reads is always provided.
 */
const props = defineProps<{
  llmSettings: LlmSettings
  /** The chosen agent's catalog (from `useLlmModels`); `null` while absent. */
  models: ModelOption[] | null
  modelsLoading?: boolean
  modelsError?: string
}>()

const emit = defineEmits<{
  'update:llmSettings': [value: LlmSettings]
}>()

const AGENT_ICONS: Record<LocalAgentName, string> = {
  claude: 'i-simple-icons-claudecode',
  opencode: 'i-simple-icons-opencode',
}

// The list portals into this field rather than `document.body`, where `z-dropdown` would
// land behind the Settings modal.
const host = useTemplateRef<HTMLElement>('host')

const localAgents = useLocalAgents()
/** `undefined` while the server is still looking. */
const agents = computed(() => localAgents?.value)
const current = computed(() => agents.value?.find(agent => agent.name === props.llmSettings.agent))

/** One agent's model ids mean nothing to another: switching resets to its default. */
function pickAgent(agent: LocalAgentName) {
  emit('update:llmSettings', { ...props.llmSettings, agent, agentModel: '' })
}

const agentModel = computed({
  get: () => props.llmSettings.agentModel,
  set: value => emit('update:llmSettings', { ...props.llmSettings, agentModel: value }),
})
</script>

<template>
  <FormField :label="$t('settings.llm.agent')">
    <p v-if="!agents" class="flex items-center gap-2 text-sm color-faint">
      <span class="i-ph:circle-notch animate-spin" aria-hidden="true" />
      {{ $t('settings.llm.agentDetecting') }}
    </p>
    <p v-else-if="!agents.length" class="text-sm color-faint">
      {{ $t('settings.llm.agentNone') }}
    </p>
    <div v-else ref="host" class="relative">
      <SelectRoot :model-value="llmSettings.agent" @update:model-value="pickAgent($event as LocalAgentName)">
        <SelectTrigger class="h-9 min-w-56 inline-flex items-center justify-between gap-2 border border-base rounded bg-raised px-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500/40">
          <span class="flex items-center gap-2">
            <span v-if="current" :class="AGENT_ICONS[current.name]" aria-hidden="true" />
            <SelectValue :placeholder="$t('settings.llm.agentPick')" />
            <span v-if="current" class="text-xs op-mute">{{ current.version }}</span>
          </span>
          <SelectIcon class="op-fade">
            <span class="i-ph:caret-down" aria-hidden="true" />
          </SelectIcon>
        </SelectTrigger>
        <SelectPortal :to="host ?? undefined">
          <SelectContent position="popper" :side-offset="6" class="z-dropdown min-w-[--reka-select-trigger-width] overflow-hidden border border-base rounded-lg bg-glass:75 shadow-lg">
            <SelectViewport class="p-1">
              <SelectItem
                v-for="agent in agents"
                :key="agent.name"
                :value="agent.name"
                class="relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-sm color-base outline-none transition data-[highlighted]:bg-hover"
              >
                <SelectItemIndicator class="absolute left-1.5 inline-flex items-center color-active">
                  <span class="i-ph:check-bold" aria-hidden="true" />
                </SelectItemIndicator>
                <span :class="AGENT_ICONS[agent.name]" aria-hidden="true" />
                <SelectItemText>{{ agent.label }}</SelectItemText>
                <span class="text-xs op-mute">{{ agent.version }}</span>
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </SelectPortal>
      </SelectRoot>
    </div>
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
