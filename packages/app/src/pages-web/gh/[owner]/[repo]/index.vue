<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../../../../app-context'
import PullsPage from '../../../../components/pulls/PullsPage.vue'
import { useDocumentTitle } from '../../../../composables/useDocumentTitle'
import { createPullRequestListStore } from '../../../../stores/pull-request-list-store'

const route = useRoute()
const owner = route.params.owner
const repo = route.params.repo

const store = createPullRequestListStore({ owner, repo }, useAppContext())

useDocumentTitle(() => `${owner}/${repo}`)

onMounted(() => store.load())
</script>

<template>
  <main>
    <PullsPage :store="store" />
  </main>
</template>
