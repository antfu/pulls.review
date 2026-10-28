<script setup lang="ts">
import { NuxtPage } from '#components'
</script>

<template>
  <NuxtPage :page-key="route => route.path" />
</template>
