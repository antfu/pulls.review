<script setup lang="ts">
</script>

<template>
  <!-- Keyed by path: a param-only navigation (one PR to the next) remounts the page and its store. -->
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </RouterView>
</template>
