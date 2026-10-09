<script setup lang="ts">
import { useRoute } from 'vue-router'
import GithubDiffPage from '../../../../../components/diff/GithubDiffPage.vue'

definePage({ name: 'github-commit' })
const route = useRoute()
</script>

<template>
  <GithubDiffPage :source-ref="{ kind: 'github-commit', owner: route.params.owner, repo: route.params.repo, sha: route.params.sha }" />
</template>
