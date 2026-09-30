<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  additions: number | undefined
  deletions: number | undefined
}>()

const { locale } = useI18n()
const format = (n: number) => n.toLocaleString(locale.value)
</script>

<template>
  <span class="whitespace-nowrap text-xs tabular-nums">
    <span v-if="additions" class="color-success-500">+{{ format(additions) }}</span>
    <span v-if="deletions" class="ml-1 color-error-500">-{{ format(deletions) }}</span>
  </span>
</template>
