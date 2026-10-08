<script setup lang="ts">
import { useGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import { useGitlabTokenMeta } from '../../composables/useGitlabTokenMeta'
import { useLlmModels } from '../../composables/useLlmModels'
import { GITLAB_HOST } from '../../gitlab-host'
import { settings } from '../../state/settings'
import { settingsModalTab } from '../../state/settingsModal'
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
const gitlabToken = useGitlabTokenMeta()
const llmModels = useLlmModels()
</script>

<template>
  <AppModal
    :title="$t('common.settings')"
    :open="open"
    padding="none"
    body-class="min-h-180"
    :document="document"
    @update:open="emit('update:open', $event ?? false)"
  >
    <SettingsPanel
      v-model:tab="settingsModalTab"
      :github-token-set="!!settings.githubToken"
      :github-token-meta="githubToken.meta.value"
      :github-token-busy="githubToken.busy.value"
      :github-token-error="githubToken.error.value"
      :gitlab-token-set="!!settings.gitlabTokens[GITLAB_HOST]"
      :gitlab-token-meta="gitlabToken.meta.value"
      :gitlab-token-busy="gitlabToken.busy.value"
      :gitlab-token-error="gitlabToken.error.value"
      :llm-settings="settings.llm"
      :models="llmModels.models.value"
      :models-loading="llmModels.loading.value"
      :models-error="llmModels.error.value"
      @save-github-token="githubToken.saveToken($event)"
      @save-gitlab-token="gitlabToken.saveToken($event)"
      @update:llm-settings="settings = { ...settings, llm: $event }"
    />
  </AppModal>
</template>
