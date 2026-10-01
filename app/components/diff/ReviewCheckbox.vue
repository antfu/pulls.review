<script setup lang="ts">
import type { ReviewStatus } from './review-status'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { computed } from 'vue'

// `FormCheckbox` is boolean-only; this adds the two half states a review needs:
// `partial` (a folder with some files reviewed) and `changed` (reviewed, then the
// file changed) - both render as indeterminate, `changed` in orange to demand a look.
const props = defineProps<{
  status: ReviewStatus | 'partial'
  ariaLabel?: string
}>()

const emit = defineEmits<{
  update: [reviewed: boolean]
}>()

const modelValue = computed(() => {
  if (props.status === 'reviewed')
    return true
  return props.status === 'unreviewed' ? false : 'indeterminate'
})

const tone = computed(() => props.status === 'changed'
  ? 'data-[state=indeterminate]:border-orange-500 data-[state=indeterminate]:bg-orange-500 focus-visible:ring-orange-500/40'
  : 'data-[state=checked]:border-primary-500 data-[state=indeterminate]:border-primary-500 data-[state=checked]:bg-primary-500 data-[state=indeterminate]:bg-primary-500 focus-visible:ring-primary-500/40')
</script>

<template>
  <CheckboxRoot
    class="h-4 w-4 flex shrink-0 items-center justify-center border border-base rounded bg-raised outline-none transition focus-visible:ring-2"
    :class="tone"
    :model-value="modelValue"
    :aria-label="ariaLabel"
    @update:model-value="emit('update', $event === true)"
  >
    <CheckboxIndicator class="text-white">
      <div :class="modelValue === 'indeterminate' ? 'i-ph:minus-bold' : 'i-ph:check-bold'" class="mt--1px text-micro" aria-hidden="true" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
