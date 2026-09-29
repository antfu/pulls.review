<script setup lang="ts">
import { useGithubTokenMeta } from '../../composables/useGithubTokenMeta'
import { settings } from '../../state/settings'
import GithubTokenSettings from './GithubTokenSettings.vue'

// Shown inside DiffsPage's error fallback so a missing/expired token can be fixed
// without opening Settings. Owning `useGithubTokenMeta` here (rather than in DiffsPage)
// keeps its meta-resolve fetch scoped to when this actually mounts - a GitHub load
// failure - so the paste view never triggers it.
const emit = defineEmits<{
  /** A token was saved successfully - the parent should retry the failed load. */
  saved: []
}>()

const { meta, busy, error, saveToken } = useGithubTokenMeta()

async function save(token: string) {
  if (await saveToken(token))
    emit('saved')
}
</script>

<template>
  <GithubTokenSettings
    :token-set="!!settings.githubToken"
    :meta="meta"
    :busy="busy"
    :error="error"
    @save="save"
  />
</template>
