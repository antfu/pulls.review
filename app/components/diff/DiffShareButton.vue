<script setup lang="ts">
import type { DiffsStoreShared } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'

defineProps<{
  shared: DiffsStoreShared
}>()
</script>

<template>
  <ActionButton
    class="text-xs shrink-0"
    variant="text"
    :disabled="shared.isSharing || !shared.canShare"
    :title="shared.canShare ? 'Post this analysis as a comment on the pull request so others can load it' : 'A GitHub token with write access is required to share'"
    :icon="shared.isSharing ? 'i-ph:spinner-duotone animate-spin' : 'i-ph:share-network-duotone'"
    @click="shared.share()"
  >
    {{ shared.isSharing ? 'Sharing…' : shared.ownComment ? 'Update shared comment' : 'Share result' }}
  </ActionButton>
  <a
    v-if="shared.ownComment && !shared.isSharing"
    :href="shared.ownComment.url"
    target="_blank"
    rel="noopener"
    class="text-xs op-fade self-center hover:underline"
  >View comment</a>
  <span v-if="shared.error" class="text-xs text-red-500 max-w-80 truncate self-center" :title="`Sharing failed: ${shared.error.message}`">Sharing failed: {{ shared.error.message }}</span>
</template>
