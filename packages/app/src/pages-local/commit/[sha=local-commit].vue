<script setup lang="ts">
import { useRoute } from 'vue-router'
import LocalDiffPage from '../../components/diff/LocalDiffPage.vue'

definePage({
  name: 'local-commit',
  params: {
    query: {
      commit: { parser: 'string', format: 'value' },
    },
  },
})
const route = useRoute()
</script>

<template>
  <LocalDiffPage :page="route.params.sha" />
</template>
