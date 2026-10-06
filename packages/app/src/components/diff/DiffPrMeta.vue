<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed, ref } from 'vue'
import DiffReviewButton from './DiffReviewButton.vue'
import DiffStats from './DiffStats.vue'
import ReviewProgressModal from './ReviewProgressModal.vue'
import ReviewSubmitModal from './ReviewSubmitModal.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
  store: DiffsStore
}>()

// `store.diff` is guaranteed set - `DiffsPage` only renders the header once it is.
const files = computed(() => props.store.diff!.files)
const totalFiles = computed(() => files.value.length)
const reviewedCount = computed(() => files.value.filter(file => props.store.reviewed.has(file.sha)).length)
const additions = computed(() => files.value.reduce((sum, file) => sum + file.additions, 0))
const deletions = computed(() => files.value.reduce((sum, file) => sum + file.deletions, 0))
const progress = computed(() => totalFiles.value === 0 ? 1 : reviewedCount.value / totalFiles.value)

const reviews = computed(() => props.store.reviews)
const reviewModalOpen = ref(false)
const progressModalOpen = ref(false)
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <DiffStats :additions="additions" :deletions="deletions" />
    <button
      type="button"
      class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-1.5 py-0.5 transition -mx-1.5 hover:bg-hover"
      :title="$t('reviewProgress.title')"
      :aria-expanded="progressModalOpen"
      @click="progressModalOpen = true"
    >
      <DisplayDonut :value="progress" :size="18" :thickness="3" />
      <span>{{ reviewedCount }} <span class="text-xs opacity-50">{{ $t('pr.reviewedOf', { total: totalFiles }) }}</span></span>
    </button>
    <DiffReviewButton
      v-if="reviews?.canWrite"
      :pending-comment-count="reviews.pendingCommentCount"
      @review="reviewModalOpen = true"
    />

    <ReviewSubmitModal
      v-if="reviews"
      v-model:open="reviewModalOpen"
      :reviews="reviews"
      :author-login="store.diff?.author?.name"
      :document="document"
    />
    <ReviewProgressModal
      v-model:open="progressModalOpen"
      :store="store"
      :document="document"
    />
  </div>
</template>
