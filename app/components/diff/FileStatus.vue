<script setup lang="ts">
import type { FileChangeStatus } from '../../types/diff'

defineProps<{
  status: FileChangeStatus
}>()

const LETTER: Record<FileChangeStatus, string> = {
  added: 'A',
  removed: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
}

const COLOR_CLASS: Record<FileChangeStatus, string> = {
  added: 'color-success-500 bg-success-500:10',
  removed: 'color-error-500 bg-error-500:10',
  modified: 'color-warning-500 bg-warning-500:10',
  renamed: 'color-blue-500 bg-blue-500:10',
  copied: 'color-blue-500 bg-blue-500:10',
}
</script>

<template>
  <span
    class="w-4 inline-flex shrink-0 items-center justify-center rounded text-xs font-mono"
    :class="COLOR_CLASS[status]"
    :title="$t(`fileStatus.${status}`)"
  >{{ LETTER[status] }}</span>
</template>
