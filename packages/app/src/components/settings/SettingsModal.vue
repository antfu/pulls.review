<script setup lang="ts">
import { useGithubAccount } from '../../composables/useGithubAccount'
import { useLlmModels } from '../../composables/useLlmModels'
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

const githubAccount = useGithubAccount()
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
      :github-account="githubAccount.account.value"
      :github-account-busy="githubAccount.busy.value"
      :github-oauth-available="githubAccount.oauthAvailable"
      :llm-settings="settings.llm"
      :models="llmModels.models.value"
      :models-loading="llmModels.loading.value"
      :models-error="llmModels.error.value"
      @sign-in-github="githubAccount.signIn()"
      @sign-out-github="void githubAccount.signOut()"
      @update:llm-settings="settings = { ...settings, llm: $event }"
    />
  </AppModal>
</template>
