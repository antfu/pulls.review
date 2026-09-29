<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  login: string
  avatarUrl?: string
  size?: number
}>(), { size: 20 })

const src = computed(() => props.avatarUrl || `https://github.com/${props.login.replace(/\[bot\]$/, '')}.png?size=${props.size * 2}`)
</script>

<template>
  <img
    :src="src"
    :width="size"
    :height="size"
    :alt="`${login}'s avatar`"
    class="rounded-full shrink-0"
  >
</template>
