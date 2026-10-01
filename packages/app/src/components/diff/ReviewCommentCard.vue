<script setup lang="ts">
import type { ReviewComment } from '@pulls.review/core'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { Markdown } from '@comark/vue'
import { ref } from 'vue'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{
  comment: ReviewComment
  /** The comment belongs to the token's user - shows edit/delete. */
  isViewer: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  edit: [body: string]
  delete: []
}>()

const editing = ref(false)
const draft = ref('')

function startEditing() {
  draft.value = props.comment.body
  editing.value = true
}

function saveEdit() {
  if (!draft.value.trim())
    return
  emit('edit', draft.value)
  editing.value = false
}
</script>

<template>
  <article class="flex flex-col gap-1.5 px-3 py-2 text-sm">
    <header class="flex items-center gap-2">
      <GithubAvatar v-if="comment.author" :login="comment.author.login" :avatar-url="comment.author.avatarUrl" :size="18" />
      <span class="font-medium">{{ comment.author?.login ?? 'ghost' }}</span>
      <DisplayDate :date="comment.createdAt" class="text-xs op-fade" />
      <DisplayBadge v-if="comment.pending" :text="$t('review.pending')" class="text-xs text-amber-700 dark:text-amber-400" />
      <div class="flex-auto" />
      <template v-if="isViewer && !editing">
        <ActionIconButton compact icon="i-ph:pencil-simple-duotone" :label="$t('review.editComment')" :disabled="busy" @click="startEditing" />
        <ActionIconButton compact icon="i-ph:trash-duotone" :label="$t('review.deleteComment')" :disabled="busy" @click="emit('delete')" />
      </template>
    </header>
    <div v-if="editing" class="flex flex-col gap-2">
      <FormTextarea v-model="draft" :rows="3" :disabled="busy" @keydown.enter.meta="saveEdit" @keydown.enter.ctrl="saveEdit" />
      <div class="flex justify-end gap-2">
        <ActionButton size="sm" variant="text" :disabled="busy" @click="editing = false">
          {{ $t('common.cancel') }}
        </ActionButton>
        <ActionButton size="sm" variant="primary" :disabled="busy || !draft.trim()" @click="saveEdit">
          {{ $t('common.save') }}
        </ActionButton>
      </div>
    </div>
    <Suspense v-else>
      <Markdown :value="comment.body" class="review-comment-markdown text-sm" />
    </Suspense>
  </article>
</template>
