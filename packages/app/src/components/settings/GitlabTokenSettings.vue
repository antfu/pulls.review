<script setup lang="ts">
import type { StoredTokenMeta } from '../../composables/useTokenMeta'
import { GITLAB_COM } from '@pulls.review/core/gitlab'
import { GITLAB_HOST } from '../../gitlab-host'
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
    icon="i-simple-icons:gitlab"
    :label="GITLAB_HOST === GITLAB_COM ? $t('settings.gitlabToken.label') : `${$t('settings.gitlabToken.label')} (${GITLAB_HOST})`"
    placeholder="glpat-…"
    :no-scopes="$t('settings.gitlabToken.noScopes')"
    :token-set="tokenSet"
    :meta="meta"
    :busy="busy"
    :error="error"
    @save="$emit('save', $event)"
  >
    <template #description>
      {{ $t('settings.gitlabToken.optional') }}<br>
      <i18n-t keypath="settings.gitlabToken.scopes" scope="global">
        <template #readApi>
          <code class="rounded bg-sunken px1 font-medium">read_api</code>
        </template>
        <template #api>
          <code class="rounded bg-sunken px1 font-medium">api</code>
        </template>
      </i18n-t><br>
      {{ $t('settings.token.storedLocally') }}
      <br><a
        :href="`https://${GITLAB_HOST}/-/user_settings/personal_access_tokens?name=pulls.review&scopes=api`"
        target="_blank"
        rel="noopener"
        class="text-primary hover:underline"
      >{{ $t('settings.gitlabToken.generate') }}</a>
    </template>
  </TokenSettings>
</template>
