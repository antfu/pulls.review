<script setup lang="ts">
import { useRoute } from 'vue-router'
import GithubDiffPage from '../../../../../components/diff/GithubDiffPage.vue'

definePage({
  name: 'github-compare',
  params: {
    path: { range: { re: /.+\.\.\..+/ } },
    query: {
      commit: { parser: 'string', format: 'value' },
      from: { parser: 'string', format: 'value' },
    },
  },
})
const route = useRoute()
</script>

<template>
  <GithubDiffPage :source-ref="{ kind: 'github-compare', owner: route.params.owner, repo: route.params.repo, ...route.params.range }" />
</template>
