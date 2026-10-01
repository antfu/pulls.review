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
  <div class="flex flex-col gap-2 p-2">
    <FormTextarea
      v-model="body"
      :rows="3"
      :placeholder="$t('review.leaveComment')"
      :disabled="busy"
      :invalid="!!error"
      @keydown.enter.meta="submit('review')"
      @keydown.enter.ctrl="submit('review')"
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
        :disabled="busy || !body.trim()"
        @click="submit('single')"
      >
        {{ $t('review.addSingle') }}
      </ActionButton>
      <ActionButton
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
