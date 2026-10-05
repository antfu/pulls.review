<script setup lang="ts">
defineProps<{ href: string }>()
</script>

<template>
  <a :href="href" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 color-active hover:underline">
    <slot />
    <span class="i-ph:arrow-square-out text-[0.85em]" aria-hidden="true" />
  </a>
</template>
