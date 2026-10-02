<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../../../../app-context'
import PullsPage from '../../../../components/pulls/PullsPage.vue'
import { useDocumentTitle } from '../../../../composables/useDocumentTitle'
import { settings } from '../../../../state/settings'
import { createPullRequestListStore } from '../../../../stores/pull-request-list-store'

const route = useRoute()
const owner = route.params.owner as string
const repo = route.params.repo as string

const store = createPullRequestListStore({ owner, repo }, { storage: useAppContext().storage, token: settings.value.githubToken })

useDocumentTitle(() => `${owner}/${repo}`)

onMounted(() => store.load())
</script>

<template>
  <main>
    <PullsPage :store="store" />
  </main>
</template>
