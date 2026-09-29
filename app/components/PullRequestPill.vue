<script setup lang="ts">
import type { PullRequestState } from '../types/diff'
import PrStatusIcon from './diff/PrStatusIcon.vue'

defineProps<{
  owner: string
  repo: string
  number: string | number
  state?: PullRequestState
  title?: string
}>()
</script>

<template>
  <RouterLink
    :to="`/gh/${owner}/${repo}/${number}`"
    :title="title"
    class="text-sm px-3 py-1.5 border border-base rounded-full flex gap-2 max-w-full transition items-center hover:border-accent-teal-400/50 hover:bg-hover"
  >
    <PrStatusIcon v-if="state" :state="state" class="text-sm" />
    <span class="font-medium whitespace-nowrap">{{ owner }}/{{ repo }}<span class="op-fade">#{{ number }}</span></span>
    <slot />
  </RouterLink>
</template>
