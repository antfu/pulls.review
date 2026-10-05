<script setup lang="ts">
import { repoRoute } from '../source-routes'
import GithubAvatar from './GithubAvatar.vue'

defineProps<{
  owner: string
  repo: string
}>()
</script>

<template>
  <RouterLink
    :to="repoRoute(owner, repo)"
    class="max-w-full flex items-center gap-2 border border-base rounded-full px-3 py-1.5 text-sm transition hover:border-accent-teal-400/50 hover:bg-hover"
  >
    <GithubAvatar :login="owner" :size="16" />
    <span class="whitespace-nowrap font-medium"><span class="op-fade">{{ owner }}/</span>{{ repo }}</span>
    <slot />
  </RouterLink>
</template>
