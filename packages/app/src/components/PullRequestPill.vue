<script setup lang="ts">
import type { PullRequestState } from '@pulls.review/core/types'
import { routeForRef } from '../source-routes'
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
    :to="routeForRef({ kind: 'github-pr', owner, repo, number: String(number) })"
    :title="title"
    class="max-w-full flex items-center gap-2 border border-base rounded-full px-3 py-1.5 text-sm transition hover:border-accent-teal-400/50 hover:bg-hover"
  >
    <PrStatusIcon v-if="state" :state="state" class="text-sm" />
    <span class="whitespace-nowrap font-medium">{{ owner }}/{{ repo }}<span class="op-fade">#{{ number }}</span></span>
    <slot />
  </RouterLink>
</template>
