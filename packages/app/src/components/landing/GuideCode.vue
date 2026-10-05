<script setup lang="ts">
import { getSharedHighlighter } from '@pierre/diffs'
import { ref, watchEffect } from 'vue'

const props = defineProps<{
  code: string
  lang: 'yaml' | 'shellscript'
}>()

const html = ref<string>()

// Reuses the diff view's highlighter and themes, so no second Shiki instance loads.
watchEffect(async () => {
  const highlighter = await getSharedHighlighter({ themes: ['pierre-light', 'pierre-dark'], langs: [props.lang] })
  html.value = highlighter.codeToHtml(props.code, {
    lang: props.lang,
    themes: { light: 'pierre-light', dark: 'pierre-dark' },
    defaultColor: false,
  })
})
</script>

<template>
  <div v-if="html" class="guide-code" v-html="html" />
  <pre v-else class="guide-code"><code>{{ code }}</code></pre>
</template>

<style>
.guide-code {
  @apply mt-2 text-xs leading-relaxed p-3 border border-base rounded-md bg-code max-w-full overflow-x-auto;
}
.guide-code .shiki span {
  color: var(--shiki-light);
}
.dark .guide-code .shiki span {
  color: var(--shiki-dark);
}
</style>
