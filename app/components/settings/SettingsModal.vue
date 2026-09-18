<script setup lang="ts">
import { useGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import { useLlmModels } from '../../composables/useLlmModels'
import { settings } from '../../state/settings'
import AppModal from '../AppModal.vue'
import SettingsPanel from './SettingsPanel.vue'

defineProps<{
  open: boolean
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const githubToken = useGithubTokenMeta()
const llmModels = useLlmModels()
</script>

<template>
  <AppModal
    title="Settings"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event ?? false)"
  >
    <SettingsPanel
      :github-token-set="!!settings.githubToken"
      :github-token-meta="githubToken.meta.value"
      :github-token-busy="githubToken.busy.value"
      :github-token-error="githubToken.error.value"
      :llm-settings="settings.llm"
      :models="llmModels.models.value"
      :models-loading="llmModels.loading.value"
      :models-error="llmModels.error.value"
      @save-github-token="githubToken.saveToken($event)"
      @update:llm-settings="settings = { ...settings, llm: $event }"
    />
  </AppModal>
</template>
