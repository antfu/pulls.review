<script setup lang="ts">
import type { DiffCategory } from '../../types/analyze'
import { CATEGORY_COLOR_CLASS, CATEGORY_ICON } from './category-icons'

defineProps<{
  category: DiffCategory
}>()
</script>

<template>
  <span :class="[CATEGORY_ICON[category], CATEGORY_COLOR_CLASS[category]]" class="shrink-0" :title="category" />
</template>
