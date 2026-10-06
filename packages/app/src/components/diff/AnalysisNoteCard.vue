<script setup lang="ts">
import type { ResolvedNote } from './group-utils'
import { Markdown } from '@comark/vue'
import CriticalMark from './CriticalMark.vue'

defineProps<{
  note: ResolvedNote
  borderless?: boolean
}>()
</script>

<template>
  <div
    class="flex items-center gap-2 overflow-hidden px-3 py-2 text-left text-sm font-sans"
    :class="[
      note.critical ? 'border-amber:30 bg-amber:10' : 'border-base bg-base',
      borderless ? '' : 'my-1 border rounded-lg max-w-200',
    ]"
  >
    <CriticalMark v-if="note.critical" class="mt-0.2 text-base" />
    <span v-else class="i-ph:sparkle-duotone mt-0.2 shrink-0 op-fade" aria-hidden="true" />
    <Suspense>
      <Markdown :value="note.text" class="min-w-0 flex-1" />
    </Suspense>
  </div>
</template>
