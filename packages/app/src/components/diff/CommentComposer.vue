<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  /** A pending review exists: the only action is adding to it. */
  hasPendingReview: boolean
  /** The source can hold a comment back in a pending review; without that, a comment can only post at once. */
  reviewMode?: boolean
  busy?: boolean
  error?: string
}>(), { reviewMode: true })

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
  <div class="flex flex-col gap-2 p-2">
    <FormTextarea
      v-model="body"
      :rows="3"
      :placeholder="$t('review.leaveComment')"
      :disabled="busy"
      :invalid="!!error"
      @keydown.enter.meta="submit(reviewMode ? 'review' : 'single')"
      @keydown.enter.ctrl="submit(reviewMode ? 'review' : 'single')"
    />
    <p v-if="error" class="text-xs text-red-600 dark:text-red-400">
      {{ error }}
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <ActionButton size="sm" variant="text" :disabled="busy" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </ActionButton>
      <ActionButton
        v-if="!props.hasPendingReview"
        size="sm"
        :variant="reviewMode ? undefined : 'primary'"
        :loading="!reviewMode && busy"
        :disabled="busy || !body.trim()"
        @click="submit('single')"
      >
        {{ $t('review.addSingle') }}
      </ActionButton>
      <ActionButton
        v-if="reviewMode"
        size="sm"
        variant="primary"
        :loading="busy"
        :disabled="!body.trim()"
        @click="submit('review')"
      >
        {{ $t(hasPendingReview ? 'review.addToReview' : 'review.startReview') }}
      </ActionButton>
    </div>
  </div>
</template>
