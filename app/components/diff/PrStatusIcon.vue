<script setup lang="ts">
import type { PullRequestState } from '../../types/diff'

defineProps<{
  state: PullRequestState
}>()

// GitHub itself uses the same pull-request glyph for open/draft/closed (color-coded)
// and a distinct merge glyph only for `merged`.
const ICON: Record<PullRequestState, string> = {
  open: 'i-ph:git-pull-request-duotone',
  draft: 'i-ph:git-pull-request-duotone',
  closed: 'i-ph:git-pull-request-duotone',
  merged: 'i-ph:git-merge-duotone',
}

const COLOR_CLASS: Record<PullRequestState, string> = {
  open: 'color-success-500',
  draft: 'color-gray-500',
  closed: 'color-error-500',
  merged: 'color-purple-500',
}
</script>

<template>
  <span :class="[ICON[state], COLOR_CLASS[state]]" class="shrink-0 text-lg" :title="$t(`prState.${state}`)" />
</template>
