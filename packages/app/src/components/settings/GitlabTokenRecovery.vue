<script setup lang="ts">
import { useGitlabTokenMeta } from '../../composables/useGitlabTokenMeta'
import { GITLAB_HOST } from '../../gitlab-host'
import { settings } from '../../state/settings'
import GitlabTokenSettings from './GitlabTokenSettings.vue'

// The GitLab counterpart of `GithubTokenRecovery`: shown in a failed load's fallback so
// a missing or expired token can be fixed without opening Settings.
const emit = defineEmits<{
  /** A token was saved successfully - the parent should retry the failed load. */
  saved: []
}>()

const { meta, busy, error, saveToken } = useGitlabTokenMeta()

async function save(token: string) {
  if (await saveToken(token))
    emit('saved')
}
</script>

<template>
  <GitlabTokenSettings
    :token-set="!!settings.gitlabTokens[GITLAB_HOST]"
    :meta="meta"
    :busy="busy"
    :error="error"
    @save="save"
  />
</template>
