<script setup lang="ts">
defineProps<{
  additions: number | undefined
  deletions: number | undefined
}>()

const format = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <span class="text-xs whitespace-nowrap tabular-nums">
    <span v-if="additions" class="color-success-500">+{{ format(additions) }}</span>
    <span v-if="deletions" class="color-error-500 ml-1">-{{ format(deletions) }}</span>
  </span>
</template>
