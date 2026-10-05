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
    class="shrink-0 text-xs"
    variant="text"
    :disabled="shared.isSharing || !shared.canShare"
    :title="$t(shared.canShare ? 'share.tooltip' : 'share.needsToken')"
    :icon="shared.isSharing ? 'i-ph:spinner-duotone animate-spin' : 'i-ph:share-network-duotone'"
    @click="confirmOpen = true"
  >
    {{ $t(shared.isSharing ? 'share.sharing' : shared.ownComment ? 'share.updateButton' : 'share.button') }}
  </ActionButton>
  <span v-if="shared.error && !confirmOpen" class="max-w-80 self-center truncate text-xs text-red-500" :title="$t('share.failed', { message: shared.error.message })">{{ $t('share.failed', { message: shared.error.message }) }}</span>

  <ShareResultModal v-model:open="confirmOpen" :store="store" :document="document" />
</template>
