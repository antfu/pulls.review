<script setup lang="ts">
import type { StoredTokenMeta } from '../../composables/useTokenMeta'
import TokenSettings from './TokenSettings.vue'

defineProps<{
  /** A token is saved in settings (the meta may still be resolving). */
  tokenSet: boolean
  meta: StoredTokenMeta | null
  /** A validation/resolve fetch is in flight. */
  busy?: boolean
  error?: string
}>()

defineEmits<{
  /** Save a new token (validated by the parent before persisting); `''` removes it. */
  save: [token: string]
}>()
</script>

<template>
  <TokenSettings
    icon="i-carbon-logo-github"
    :label="$t('settings.token.label')"
    placeholder="ghp_…"
    :no-scopes="$t('settings.token.fineGrained')"
    :token-set="tokenSet"
    :meta="meta"
    :busy="busy"
    :error="error"
    @save="$emit('save', $event)"
  >
    <template #description>
      {{ $t('settings.token.optional') }}<br>
      <i18n-t keypath="settings.token.scopes" scope="global">
        <template #repo>
          <code class="rounded bg-sunken px1 font-medium">repo</code>
        </template>
        <template #fineGrained>
          <code class="rounded bg-sunken px1 font-medium">Pull requests: Read and write</code>
        </template>
      </i18n-t><br>
      {{ $t('settings.token.storedLocally') }}
      <br><a
        href="https://github.com/settings/tokens/new?description=pulls.review&scopes=repo"
        target="_blank"
        rel="noopener"
        class="text-primary hover:underline"
      >{{ $t('settings.token.generate') }}</a>
    </template>
  </TokenSettings>
</template>
