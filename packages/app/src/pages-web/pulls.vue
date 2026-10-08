<script setup lang="ts">
import type { RepositoryRef } from '@pulls.review/core/types'
import { onMounted } from 'vue'
import { useAppContext } from '../app-context'
import PullsPage from '../components/pulls/PullsPage.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { repositoryName } from '../source-routes'
import { createPullRequestListSource } from '../sources'
import { createPullRequestListStore } from '../stores/pull-request-list-store'

const props = defineProps<{ repository: RepositoryRef }>()

// Read once: `App.vue` keys the routed page by path, so another repository mounts a fresh page and store.
const { repository } = props
const { cache, credentials } = useAppContext()
const store = createPullRequestListStore(createPullRequestListSource(repository, credentials), { cache })

const { owner, name } = repositoryName(repository)
useDocumentTitle(() => `${owner}/${name}`)

onMounted(() => store.load())
</script>

<template>
  <main>
    <PullsPage :store="store" />
  </main>
</template>
