<script setup lang="ts">
import type { DiffSource } from '@pulls.review/core/types'
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  login: string
  avatarUrl?: string
  size?: number
  /** The host the login is from. Only GitHub serves an avatar by login; any other login falls back to its initial. */
  auth?: DiffSource['auth']
}>(), { size: 20 })

const failed = ref(false)
const src = computed(() => props.avatarUrl || (props.auth === 'gitlab-token' ? undefined : `https://github.com/${props.login.replace(/\[bot\]$/, '')}.png?size=${props.size * 2}`))

watch(src, () => {
  failed.value = false
})
</script>

<template>
  <span
    role="img"
    :aria-label="$t('common.avatar', { login })"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised"
  >
    <img v-if="src && !failed" :src="src" alt="" class="h-full w-full object-cover" @error="failed = true">
    <span v-else aria-hidden="true" class="text-xs font-medium leading-none op-fade">{{ login.charAt(0).toUpperCase() || '?' }}</span>
  </span>
</template>
