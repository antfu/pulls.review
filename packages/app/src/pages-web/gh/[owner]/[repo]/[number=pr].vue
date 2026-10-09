<script setup lang="ts">
import { useRoute } from 'vue-router'
import GithubDiffPage from '../../../../components/diff/GithubDiffPage.vue'

definePage({
  name: 'github-pr',
  params: {
    path: { number: { re: /\d+/ } },
    query: {
      commit: { parser: 'string', format: 'value' },
      from: { parser: 'string', format: 'value' },
    },
  },
})
const route = useRoute()
</script>

<template>
  <GithubDiffPage :source-ref="{ kind: 'github-pr', owner: route.params.owner, repo: route.params.repo, number: route.params.number }" />
</template>
