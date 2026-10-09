<script setup lang="ts">
import { renderMermaidSVG } from 'beautiful-mermaid'
import { computed, inject } from 'vue'
import { isDark as defaultIsDark, isDarkKey } from '../state/dark'

const props = defineProps<{
  content: string
}>()

const isDark = inject(isDarkKey, defaultIsDark)

// `beautiful-mermaid` covers fewer diagram types than GitHub's renderer and throws on
// the rest (and on invalid source), which then stays readable as the code block it was.
const svg = computed(() => {
  try {
    return renderMermaidSVG(props.content, {
      bg: isDark.value ? '#121212' : '#ffffff',
      fg: isDark.value ? '#e5e5e5' : '#262626',
      transparent: true,
      padding: 16,
    })
  }
  catch {
    return undefined
  }
})
</script>

<template>
  <div v-if="svg" class="markdown-mermaid" v-html="svg" />
  <pre v-else><code>{{ content }}</code></pre>
</template>
