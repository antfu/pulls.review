<script setup lang="ts">
import type { DiffsStoreReviews } from '../../stores/types'
import type { ReviewVerdict } from '../../types/comment-threads'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormRadioGroup from '@antfu/design/components/Form/FormRadioGroup.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { ref } from 'vue'
import AppModal from '../AppModal.vue'

const props = defineProps<{
  open: boolean
  reviews: DiffsStoreReviews
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const body = ref('')
const verdict = ref<ReviewVerdict>('COMMENT')
const busy = ref(false)
const error = ref<string>()

const verdictOptions = [
  { value: 'COMMENT', label: 'Comment' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REQUEST_CHANGES', label: 'Request changes' },
]

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = undefined
  try {
    await action()
    body.value = ''
    verdict.value = 'COMMENT'
    emit('update:open', false)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    title="Review changes"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="p-3 flex flex-col gap-3 w-full sm:w-100">
      <p v-if="reviews.pendingCommentCount > 0" class="text-sm op-fade">
        Submitting includes your {{ reviews.pendingCommentCount }} pending comment{{ reviews.pendingCommentCount === 1 ? '' : 's' }}.
      </p>
      <FormTextarea
        v-model="body"
        :rows="4"
        placeholder="Leave a summary (optional for Approve)"
        :disabled="busy"
        :invalid="!!error"
      />
      <FormRadioGroup v-model="verdict" :options="verdictOptions" />
      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">
        {{ error }}
      </p>
      <div class="flex gap-2 items-center justify-end">
        <ActionButton
          v-if="reviews.pendingReview"
          variant="text"
          class="text-red-600 dark:text-red-400"
          :disabled="busy"
          @click="run(() => props.reviews.discardPendingReview())"
        >
          Discard review
        </ActionButton>
        <div class="flex-auto" />
        <ActionButton
          variant="primary"
          :loading="busy"
          :disabled="verdict !== 'APPROVE' && !body.trim() && reviews.pendingCommentCount === 0"
          @click="run(() => props.reviews.submitReview(verdict, body))"
        >
          Submit review
        </ActionButton>
      </div>
    </div>
  </AppModal>
</template>
