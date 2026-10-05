<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { BOOKMARKLET } from './bookmarklet'
</script>

<template>
  <!--
    Dragged onto the bookmarks bar, the link text becomes the bookmark's name, so it
    stays untranslated. A click would run the bookmarklet here, where it only alerts.
  -->
  <ActionButton
    :href="BOOKMARKLET"
    icon="i-ph:bookmark-simple-duotone"
    class="cursor-grab active:cursor-grabbing"
    :title="$t('landing.bookmarkletDrag')"
    @click.prevent
  >
    pulls.review ⇄ GitHub
  </ActionButton>
</template>
