<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useEventListener } from '@vueuse/core'
import { ref } from 'vue'
import NavControls from './NavControls.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
}>()

const scrollY = ref(0)
useEventListener(() => props.document ?? document, 'scroll', (event) => {
  scrollY.value = event.target instanceof Element ? event.target.scrollTop : window.scrollY
}, { capture: true })
</script>

<template>
  <header class="sticky top-0 z-nav h-14 flex items-center gap-3 border-b bg-base bg-glass px-4 transition-all" :class="scrollY > 10 ? 'border-base' : 'border-transparent'">
    <RouterLink to="/" class="shrink-0 text-lg font-mono">
      <span class="color-accent-magenta">+</span>pulls<span class="color-accent-orange">.</span><span class="color-accent-teal">review</span>
    </RouterLink>

    <div class="flex-1" />

    <NavControls>
      <ActionIconButton
        href="https://github.com/antfu/pulls.review"
        target="_blank"
        rel="noopener"
        icon="i-carbon-logo-github"
        :label="$t('common.githubRepository')"
        tooltip="GitHub"
      />
    </NavControls>
  </header>
</template>
