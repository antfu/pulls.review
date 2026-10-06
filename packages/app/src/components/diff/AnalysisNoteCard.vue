<script setup lang="ts">
import type { ResolvedNote } from './group-utils'
import { Markdown } from '@comark/vue'
import CriticalMark from './CriticalMark.vue'

defineProps<{
  note: ResolvedNote
}>()
</script>

<template>
  <div class="my-1 max-w-200 overflow-hidden border border-base rounded-lg bg-base text-left font-sans">
    <div class="flex items-center gap-1.5 px-3 pt-1.5 text-xs op-fade">
      <span class="i-ph:sparkle-duotone shrink-0" aria-hidden="true" />
      {{ $t('note.label') }}
      <CriticalMark v-if="note.critical" class="ml-auto text-sm" />
    </div>
    <Suspense>
      <Markdown :value="note.text" class="px-3 pb-2 text-sm" />
    </Suspense>
  </div>
</template>
