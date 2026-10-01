<script setup lang="ts">
import LandingDemo from './LandingDemo.vue'
import LandingHero from './LandingHero.vue'
</script>

<template>
  <!-- Fixed 1200x630 (Open Graph size) so the story canvas can be screenshotted 1:1 into `og.png`. -->
  <div
    id="og-image"
    class="relative grid grid-cols-[minmax(0,1fr)_30rem] shrink-0 items-center gap-14 overflow-hidden bg-base px20 py-12 color-base"
    style="width: 1200px; height: 630px"
  >
    <div class="flex flex-col gap-8">
      <div class="flex items-center gap-3">
        <span class="text-xl font-medium font-mono">pulls.review</span>
      </div>
      <LandingHero style="font-size: 72px" />
      <p class="max-w-md text-xl leading-relaxed op-fade">
        Groups changed files, summarizes what matters, review them one scope at a time.
      </p>
    </div>

    <div
      class="h-full max-h-[calc(100%+1rem)] scale-110 overflow-hidden border border-base rounded-xl bg-base p-5 shadow-xl"
      style="mask-image: linear-gradient(to bottom, #000 80%, transparent)"
    >
      <LandingDemo still class="w-full scale-105" :show-header="false" />
    </div>
  </div>
</template>
