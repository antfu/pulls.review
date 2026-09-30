<script setup lang="ts">
import type { DiffCategory } from '../../types/analyze'

defineProps<{
  category: DiffCategory
}>()

const ICON: Record<DiffCategory, string> = {
  ui: 'i-ph:layout',
  api: 'i-ph:plugs-connected',
  core: 'i-ph:cpu',
  data: 'i-ph:database',
  cli: 'i-ph:terminal-window',
  security: 'i-ph:shield-check',
  tests: 'i-ph:flask',
  docs: 'i-ph:book-open',
  examples: 'i-ph:play-circle',
  deps: 'i-ph:package',
  build: 'i-ph:hammer',
  scripts: 'i-ph:wrench',
  config: 'i-ph:sliders-horizontal',
  i18n: 'i-ph:translate',
  assets: 'i-ph:image',
  other: 'i-ph:dots-three-circle',
}

// One distinct hue per category so groups can be told apart at a glance.
const COLOR_CLASS: Record<DiffCategory, string> = {
  ui: 'color-pink-500',
  api: 'color-blue-500',
  core: 'color-violet-500',
  data: 'color-amber-500',
  cli: 'color-lime-500',
  security: 'color-red-500',
  tests: 'color-green-500',
  docs: 'color-sky-500',
  examples: 'color-cyan-500',
  deps: 'color-orange-500',
  build: 'color-yellow-500',
  scripts: 'color-emerald-500',
  config: 'color-teal-500',
  i18n: 'color-indigo-500',
  assets: 'color-fuchsia-500',
  other: 'color-neutral-500',
}
</script>

<template>
  <span :class="[ICON[category], COLOR_CLASS[category]]" class="shrink-0" :title="category" />
</template>
