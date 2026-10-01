<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'

defineProps<{
  pendingCommentCount: number
}>()

defineEmits<{
  review: []
}>()
</script>

<template>
  <div class="relative shrink-0">
    <ActionButton size="sm" variant="action" icon="i-ph:chat-centered-text-duotone" @click="$emit('review')">
      {{ $t('review.addReview') }}
    </ActionButton>
    <DisplayNumberBadge v-if="pendingCommentCount > 0" :value="pendingCommentCount" class="absolute right--2 top--2" />
  </div>
</template>
