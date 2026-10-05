<script setup lang="ts">
import type { ThemedToken } from '@pierre/diffs'
import { getSharedHighlighter } from '@pierre/diffs'
import { ref, watchEffect } from 'vue'
import { syntaxTheme } from '../../state/syntax-theme'

const props = defineProps<{
  code: string
  lang: 'yaml' | 'shellscript'
}>()

const lines = ref<ThemedToken[][]>()

// Reuses the diff view's highlighter and themes, so no second Shiki instance loads.
// `light-dark()` colors follow the `color-scheme` that `.dark` sets.
watchEffect(async () => {
  const { light, dark } = syntaxTheme.value
  const highlighter = await getSharedHighlighter({ themes: [light, dark], langs: [props.lang] })
  lines.value = highlighter.codeToTokens(props.code, {
    lang: props.lang,
    themes: { light, dark },
    defaultColor: 'light-dark()',
  }).tokens
})
</script>

<template>
  <pre class="mt-2 max-w-full overflow-x-auto border border-base rounded-md bg-code p-3 text-xs leading-relaxed"><code v-if="lines"><template v-for="(line, i) in lines" :key="i">{{ i ? '\n' : '' }}<span v-for="(token, j) in line" :key="j" :style="token.htmlStyle">{{ token.content }}</span></template></code><code v-else>{{ code }}</code></pre>
</template>
