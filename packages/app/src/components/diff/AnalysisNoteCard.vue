<script setup lang="ts">
import type { ResolvedNote } from './group-utils'
import { Markdown } from '@comark/vue'
import CriticalMark from './CriticalMark.vue'

defineProps<{
  note: ResolvedNote
}>()
</script>

<template>
  <div
    class="my-1 max-w-200 flex items-start gap-2 overflow-hidden border rounded-lg px-3 py-2 text-left text-sm font-sans"
    :class="note.critical ? 'border-amber:30 bg-amber:10' : 'border-base bg-base'"
  >
    <CriticalMark v-if="note.critical" class="mt-0.5 text-base" />
    <span v-else class="i-ph:sparkle-duotone mt-0.5 shrink-0 op-fade" aria-hidden="true" />
    <Suspense>
      <Markdown :value="note.text" class="min-w-0 flex-1" />
    </Suspense>
  </div>
</template>
