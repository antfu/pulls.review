<script setup lang="ts">
import type { ModelOption } from '../../analyze/adapters/llm/list-models'
import type { StoredGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import type { LlmSettings } from '../../state/settings'
import AutoRefreshSettingsSection from './AutoRefreshSettingsSection.vue'
import GithubTokenSettings from './GithubTokenSettings.vue'
import LayoutSettingsSection from './LayoutSettingsSection.vue'
import LlmSettingsSection from './LlmSettingsSection.vue'

defineProps<{
  githubTokenSet: boolean
  githubTokenMeta: StoredGithubTokenMeta | null
  githubTokenBusy?: boolean
  githubTokenError?: string
  llmSettings: LlmSettings
  models: ModelOption[] | null
  modelsLoading?: boolean
  modelsError?: string
  isEmbedded?: boolean
}>()

defineEmits<{
  /** Save a new GitHub token (validated by the container); `''` removes it. */
  'saveGithubToken': [token: string]
  'update:llmSettings': [value: LlmSettings]
}>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <LayoutSettingsSection />

    <div class="border-t border-base" />

    <AutoRefreshSettingsSection />

    <div class="border-t border-base" />

    <GithubTokenSettings
      :token-set="githubTokenSet"
      :meta="githubTokenMeta"
      :busy="githubTokenBusy"
      :error="githubTokenError"
      @save="$emit('saveGithubToken', $event)"
    />

    <div class="border-t border-base" />

    <LlmSettingsSection
      :llm-settings="llmSettings"
      :models="models"
      :models-loading="modelsLoading"
      :models-error="modelsError"
      :is-embedded="isEmbedded"
      @update:llm-settings="$emit('update:llmSettings', $event)"
    />
  </div>
</template>
