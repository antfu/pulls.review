<script setup lang="ts">
import { useRoute } from 'vue-router'
import LocalDiffPage from '../../components/diff/LocalDiffPage.vue'

definePage({ name: 'local-compare', params: { path: { range: { re: /.+/ } } } })
const route = useRoute()
</script>

<template>
  <LocalDiffPage :page="route.params.range" />
</template>
