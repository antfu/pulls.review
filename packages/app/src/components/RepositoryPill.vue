<script setup lang="ts">
import type { RepositoryRef } from '@pulls.review/core/types'
import { computed } from 'vue'
import { repositoryName, repositoryRoute } from '../source-routes'
import GithubAvatar from './GithubAvatar.vue'

const props = defineProps<{
  repository: RepositoryRef
}>()

const name = computed(() => repositoryName(props.repository))
</script>

<template>
  <RouterLink
    :to="repositoryRoute(repository)"
    class="max-w-full flex items-center gap-2 border border-base rounded-full px-3 py-1.5 text-sm transition hover:border-accent-teal-400/50 hover:bg-hover"
  >
    <GithubAvatar v-if="repository.kind === 'github-repo'" :login="name.owner" :size="16" />
    <!-- A GitLab namespace has no avatar to fetch by name; the logo tells the two hosts apart. -->
    <span v-else class="i-simple-icons:gitlab shrink-0 op-fade" aria-hidden="true" />
    <span class="whitespace-nowrap font-medium"><span class="op-fade">{{ name.owner }}/</span>{{ name.name }}</span>
    <slot />
  </RouterLink>
</template>
