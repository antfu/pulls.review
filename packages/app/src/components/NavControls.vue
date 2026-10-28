<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { RouterLink } from 'vue-router'
import { githubOauthSession, isGithubOauthAvailable } from '../auth/github-oauth'
import { openSettings, settingsModalOpen } from '../state/settingsModal'
import DarkToggle from './DarkToggle.vue'
import LanguageMenu from './LanguageMenu.vue'
import SettingsModal from './settings/SettingsModal.vue'

defineProps<{
  document?: Document | ShadowRoot
}>()

/**
 * The GitHub-embedded build hides the dark-mode toggle (embed styling already follows
 * GitHub's own theme, via `embed/dark.ts`'s scoped `isDark` - `DarkToggle` only ever
 * touches the global, page-wide one) and skips mounting its own `SettingsModal`, since
 * `EmbedApp.ce.vue` already mounts one at the embed's root.
 */
const isEmbedded = import.meta.env.PR_EMBED
</script>

<template>
  <div class="flex shrink-0 items-center gap-1">
    <slot />
    <RouterLink
      v-if="!isEmbedded && isGithubOauthAvailable() && githubOauthSession"
      to="/inbox"
      class="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition hover:bg-hover"
      :title="$t('inbox.title')"
    >
      <span class="i-ph:tray-duotone" aria-hidden="true" />
      <span class="hidden md:inline">{{ $t('inbox.title') }}</span>
    </RouterLink>
    <RouterLink v-if="!isEmbedded" to="/repositories" class="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition hover:bg-hover" :title="$t('repos.title')">
      <span class="i-octicon:repo-16" aria-hidden="true" />
      <span class="hidden md:inline">{{ $t('repos.title') }}</span>
    </RouterLink>
    <LanguageMenu />
    <ActionIconButton icon="i-ph:gear-duotone" :label="$t('common.settings')" :tooltip="$t('common.settings')" @click="openSettings()" />
    <DarkToggle v-if="!isEmbedded" />
  </div>
  <SettingsModal v-if="!isEmbedded" v-model:open="settingsModalOpen" :document="document" />
</template>
