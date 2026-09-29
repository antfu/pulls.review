<script setup lang="ts">
import type { ReviewComment } from '../../types/comment-threads'
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
  <article class="text-sm px-3 py-2 flex flex-col gap-1.5">
    <header class="flex gap-2 items-center">
      <GithubAvatar v-if="comment.author" :login="comment.author.login" :avatar-url="comment.author.avatarUrl" :size="18" />
      <span class="font-medium">{{ comment.author?.login ?? 'ghost' }}</span>
      <DisplayDate :date="comment.createdAt" class="text-xs op-fade" />
      <DisplayBadge v-if="comment.pending" text="Pending" class="text-xs text-amber-700 dark:text-amber-400" />
      <div class="flex-auto" />
      <template v-if="isViewer && !editing">
        <ActionIconButton compact icon="i-ph:pencil-simple-duotone" label="Edit comment" :disabled="busy" @click="startEditing" />
        <ActionIconButton compact icon="i-ph:trash-duotone" label="Delete comment" :disabled="busy" @click="emit('delete')" />
      </template>
    </header>
    <div v-if="editing" class="flex flex-col gap-2">
      <FormTextarea v-model="draft" :rows="3" :disabled="busy" @keydown.enter.meta="saveEdit" @keydown.enter.ctrl="saveEdit" />
      <div class="flex gap-2 justify-end">
        <ActionButton size="sm" variant="text" :disabled="busy" @click="editing = false">
          Cancel
        </ActionButton>
        <ActionButton size="sm" variant="primary" :disabled="busy || !draft.trim()" @click="saveEdit">
          Save
        </ActionButton>
      </div>
    </div>
    <Suspense v-else>
      <Markdown :value="comment.body" class="text-sm" />
    </Suspense>
  </article>
</template>
