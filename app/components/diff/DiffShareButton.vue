<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, ref } from 'vue'
import ShareResultModal from './ShareResultModal.vue'

const props = defineProps<{
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

// Only rendered when `store.shared` is set - `DiffsHeader` gates on it.
const shared = computed(() => props.store.shared!)
const confirmOpen = ref(false)
</script>

<template>
  <ActionButton
    class="text-xs shrink-0"
    variant="text"
    :disabled="shared.isSharing || !shared.canShare"
    :title="shared.canShare ? 'Post this analysis as a comment on the pull request so others can load it' : 'A GitHub token with write access is required to share'"
    :icon="shared.isSharing ? 'i-ph:spinner-duotone animate-spin' : 'i-ph:share-network-duotone'"
    @click="confirmOpen = true"
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
  <span v-if="shared.error && !confirmOpen" class="text-xs text-red-500 max-w-80 truncate self-center" :title="`Sharing failed: ${shared.error.message}`">Sharing failed: {{ shared.error.message }}</span>

  <ShareResultModal v-model:open="confirmOpen" :store="store" :document="document" />
</template>
