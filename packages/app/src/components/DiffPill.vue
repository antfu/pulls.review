<script setup lang="ts">
import type { PullRequestState } from '@pulls.review/core/types'
import PrStatusIcon from './diff/PrStatusIcon.vue'

defineProps<{
  to: string
  /** Where the diff sits, e.g. `owner/repo`. */
  parent?: string
  label?: string
  state?: PullRequestState
  title?: string
}>()
</script>

<template>
  <RouterLink
    :to="to"
    :title="title"
    class="max-w-full flex items-center gap-2 border border-base rounded-full px-3 py-1.5 text-sm transition hover:border-accent-teal-400/50 hover:bg-hover"
  >
    <PrStatusIcon v-if="state" :state="state" class="text-sm" />
    <span class="whitespace-nowrap font-medium">{{ parent }}<span v-if="label" class="op-fade">{{ parent ? ' ' : '' }}{{ label }}</span></span>
    <slot />
  </RouterLink>
</template>
