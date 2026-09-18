<script setup lang="ts">
import type { ModelOption } from '../../analyze/adapters/llm/list-models'
import type { StoredGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import type { LlmSettings } from '../../state/settings'
import GithubTokenSettings from './GithubTokenSettings.vue'
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
}>()

defineEmits<{
  /** Save a new GitHub token (validated by the container); `''` removes it. */
  'saveGithubToken': [token: string]
  'update:llmSettings': [value: LlmSettings]
}>()
</script>

<template>
  <div class="flex flex-col gap-6">
    <GithubTokenSettings
      :token-set="githubTokenSet"
      :meta="githubTokenMeta"
      :busy="githubTokenBusy"
      :error="githubTokenError"
      @save="$emit('saveGithubToken', $event)"
    />

    <LlmSettingsSection
      :llm-settings="llmSettings"
      :models="models"
      :models-loading="modelsLoading"
      :models-error="modelsError"
      @update:llm-settings="$emit('update:llmSettings', $event)"
    />
  </div>
</template>
