<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { ref } from 'vue'

const props = defineProps<{
  /** A pending review exists: the only action is adding to it. */
  hasPendingReview: boolean
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  submit: [body: string, mode: 'single' | 'review']
  cancel: []
}>()

const body = ref('')

function submit(mode: 'single' | 'review') {
  if (!body.value.trim())
    return
  emit('submit', body.value, mode)
}
</script>

<template>
  <div class="p-2 flex flex-col gap-2">
    <FormTextarea
      v-model="body"
      :rows="3"
      placeholder="Leave a comment"
      :disabled="busy"
      :invalid="!!error"
      @keydown.enter.meta="submit('review')"
      @keydown.enter.ctrl="submit('review')"
    />
    <p v-if="error" class="text-xs text-red-600 dark:text-red-400">
      {{ error }}
    </p>
    <div class="flex flex-wrap gap-2 justify-end">
      <ActionButton size="sm" variant="text" :disabled="busy" @click="emit('cancel')">
        Cancel
      </ActionButton>
      <ActionButton
        v-if="!props.hasPendingReview"
        size="sm"
        :disabled="busy || !body.trim()"
        @click="submit('single')"
      >
        Add single comment
      </ActionButton>
      <ActionButton
        size="sm"
        variant="primary"
        :loading="busy"
        :disabled="!body.trim()"
        @click="submit('review')"
      >
        {{ hasPendingReview ? 'Add review comment' : 'Start a review' }}
      </ActionButton>
    </div>
  </div>
</template>
