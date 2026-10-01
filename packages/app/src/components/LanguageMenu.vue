<script setup lang="ts">
import type { Locale } from '@pulls.review/core'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { LOCALES } from '@pulls.review/core'
import { onClickOutside } from '@vueuse/core'
import { ref, useTemplateRef } from 'vue'
import { settings } from '../state/settings'

// An in-flow dropdown rather than a portalled popper: inside the embed's shadow
// root a teleported list escapes unstyled (same reason `ModelPicker` is inline).
// Writes the app-wide singleton directly, like `DarkToggle` does for `isDark`.
const open = ref(false)
const root = useTemplateRef<HTMLDivElement>('root')
onClickOutside(root, () => open.value = false)

function pick(locale: Locale) {
  settings.value = { ...settings.value, locale }
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative">
    <ActionIconButton
      icon="i-ph:translate-duotone"
      :label="$t('settings.language')"
      :tooltip="$t('settings.language')"
      :active="open"
      :aria-expanded="open"
      @click="open = !open"
    />
    <div
      v-if="open"
      role="listbox"
      class="absolute right-0 top-full z-dropdown mt-1 min-w-40 flex flex-col overflow-hidden border border-base rounded-lg bg-base p-1 shadow-lg"
    >
      <button
        v-for="locale in LOCALES"
        :key="locale.code"
        type="button"
        role="option"
        :aria-selected="locale.code === settings.locale"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition focus-visible:bg-hover hover:bg-hover"
        :class="locale.code === settings.locale ? 'color-active' : 'color-base'"
        @click="pick(locale.code)"
      >
        <span class="min-w-0 flex-1 whitespace-nowrap">{{ locale.native }}</span>
        <span v-if="locale.code === settings.locale" class="i-ph:check shrink-0 text-xs" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
