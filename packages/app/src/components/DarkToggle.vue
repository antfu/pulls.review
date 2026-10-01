<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { watchEffect } from 'vue'
import { isDark } from '../state/dark'

// No Nuxt `useHead` here - a dedicated meta tag (unconditional, unlike index.html's
// static prefers-color-scheme pair) that mirrors the app's actual dark-mode state.
const themeColorMeta = document.head.appendChild(document.createElement('meta'))
themeColorMeta.name = 'theme-color'
watchEffect(() => {
  themeColorMeta.content = isDark.value ? '#222222' : '#ffffff'
})

function toggleDark() {
  isDark.value = !isDark.value
}
</script>

<template>
  <ActionIconButton
    icon="i-ph-sun-duotone dark:i-ph-moon-duotone"
    @click="toggleDark"
  />
</template>
