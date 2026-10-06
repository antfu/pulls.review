<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
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
    <LanguageMenu />
    <ActionIconButton icon="i-ph:gear-duotone" :label="$t('common.settings')" :tooltip="$t('common.settings')" @click="openSettings()" />
    <DarkToggle v-if="!isEmbedded" />
  </div>
  <SettingsModal v-if="!isEmbedded" v-model:open="settingsModalOpen" :document="document" />
</template>
