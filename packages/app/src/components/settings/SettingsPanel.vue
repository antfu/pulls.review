<script setup lang="ts">
import type { LlmSettings } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'
import type { StoredGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import type { SettingsTab } from '../../state/settingsModal'
import { resolveModel } from '@pulls.review/core/analyze'
import { TabsContent, TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AutoFetchFullFileSettingsSection from './AutoFetchFullFileSettingsSection.vue'
import AutoRefreshSettingsSection from './AutoRefreshSettingsSection.vue'
import GithubTokenSettings from './GithubTokenSettings.vue'
import LayoutSettingsSection from './LayoutSettingsSection.vue'
import LlmSettingsSection from './LlmSettingsSection.vue'
import SyntaxThemeSettingsSection from './SyntaxThemeSettingsSection.vue'

const props = defineProps<{
  githubTokenSet: boolean
  githubTokenMeta: StoredGithubTokenMeta | null
  githubTokenBusy?: boolean
  githubTokenError?: string
  llmSettings: LlmSettings
  models: ModelOption[] | null
  modelsLoading?: boolean
  modelsError?: string
}>()

defineEmits<{
  /** Save a new GitHub token (validated by the container); `''` removes it. */
  'saveGithubToken': [token: string]
  'update:llmSettings': [value: LlmSettings]
}>()

const tab = defineModel<SettingsTab>('tab', { default: 'appearance' })

const { t } = useI18n()

/** The AI tab is "set up" with a key for the selected provider, or a local agent chosen. */
const llmSetup = computed(() => resolveModel(props.llmSettings) !== undefined || (props.llmSettings.provider === 'local-agent' && !!props.llmSettings.agent))

// Reka's own tabs rather than `LayoutTabs`: the GitHub and AI tabs carry a dot while unset.
const tabs = computed(() => [
  { value: 'appearance', label: t('settings.tabs.appearance'), icon: 'i-ph:paint-brush-duotone' },
  { value: 'behavior', label: t('settings.tabs.behavior'), icon: 'i-ph:sliders-duotone' },
  { value: 'github', label: t('settings.tabs.github'), icon: 'i-ph:github-logo-duotone', attention: !props.githubTokenSet },
  { value: 'ai', label: t('settings.tabs.ai'), icon: 'i-ph:sparkle-duotone', attention: !llmSetup.value },
] satisfies { value: SettingsTab, label: string, icon: string, attention?: boolean }[])
</script>

<template>
  <TabsRoot v-model="tab" class="flex flex-col">
    <TabsList class="relative flex items-center gap-1 border-b border-base px-2 pt2" :aria-label="$t('common.settings')">
      <TabsTrigger
        v-for="item in tabs"
        :key="item.value"
        :value="item.value"
        class="relative flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm color-muted outline-none transition -mb-px data-[state=active]:color-active hover:color-base focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span :class="item.icon" aria-hidden="true" />
        {{ item.label }}
        <span
          v-if="item.attention"
          class="h-1.5 w-1.5 rounded-full bg-warning-500"
          :title="$t('settings.tabs.notSetUp')"
        />
      </TabsTrigger>
      <TabsIndicator class="absolute bottom-0 left-0 h-0.5 w-[--reka-tabs-indicator-size] translate-x-[--reka-tabs-indicator-position] rounded-full bg-primary-500 transition-all duration-200" />
    </TabsList>

    <TabsContent value="appearance" class="flex flex-col gap-4 p4 outline-none data-[state=inactive]:hidden">
      <LayoutSettingsSection />
      <div class="border-t border-base" />
      <SyntaxThemeSettingsSection />
    </TabsContent>

    <TabsContent value="behavior" class="flex flex-col gap-4 p4 outline-none data-[state=inactive]:hidden">
      <AutoRefreshSettingsSection />
      <div class="border-t border-base" />
      <AutoFetchFullFileSettingsSection />
    </TabsContent>

    <TabsContent value="github" class="flex flex-col gap-4 p4 outline-none data-[state=inactive]:hidden">
      <GithubTokenSettings
        :token-set="githubTokenSet"
        :meta="githubTokenMeta"
        :busy="githubTokenBusy"
        :error="githubTokenError"
        @save="$emit('saveGithubToken', $event)"
      />
    </TabsContent>

    <TabsContent value="ai" class="flex flex-col gap-4 p4 outline-none data-[state=inactive]:hidden">
      <LlmSettingsSection
        :llm-settings="llmSettings"
        :models="models"
        :models-loading="modelsLoading"
        :models-error="modelsError"
        @update:llm-settings="$emit('update:llmSettings', $event)"
      />
    </TabsContent>
  </TabsRoot>
</template>
