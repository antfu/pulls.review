<script setup lang="ts">
import LocalDiffPage from '../components/diff/LocalDiffPage.vue'

definePage({
  name: 'local-worktree',
  params: {
    query: {
      commit: { parser: 'string', format: 'value' },
    },
  },
})
</script>

<template>
  <LocalDiffPage :page="{ kind: 'worktree' }" />
</template>
