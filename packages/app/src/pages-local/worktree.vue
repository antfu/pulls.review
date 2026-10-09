<script setup lang="ts">
import LocalDiffPage from '../components/diff/LocalDiffPage.vue'

definePage({ name: 'local-worktree' })
</script>

<template>
  <LocalDiffPage :page="{ kind: 'worktree' }" />
</template>
