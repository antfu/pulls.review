<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import NavControls from './NavControls.vue'
</script>

<template>
  <header class="px-4 border-b border-base bg-base flex gap-3 h-14 items-center top-0 sticky z-nav">
    <RouterLink to="/" class="text-lg font-mono font-semibold shrink-0">
      <span class="color-accent-teal">+</span>pulls.review
    </RouterLink>

    <div class="flex-1" />

    <ActionIconButton
      href="https://github.com/antfu/pulls.review"
      target="_blank"
      rel="noopener"
      icon="i-ph:github-logo-duotone"
      label="GitHub repository"
      tooltip="GitHub"
    />
    <NavControls />
  </header>
</template>
