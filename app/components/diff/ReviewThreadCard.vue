<script setup lang="ts">
import type { DiffsStoreReviews } from '../../stores/types'
import type { CommentThread } from '../../types/comment-threads'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { computed, ref } from 'vue'
import ReviewCommentCard from './ReviewCommentCard.vue'

const props = defineProps<{
  thread: CommentThread
  reviews: DiffsStoreReviews
}>()

const busy = ref(false)
const error = ref<string>()
const replying = ref(false)
const replyBody = ref('')

const canWrite = computed(() => props.reviews.canWrite)
// Resolve needs the GraphQL thread id (unknown without a token) and makes no
// sense on the viewer's own unsubmitted draft.
const canResolve = computed(() => canWrite.value && !!props.thread.threadId && !props.thread.pending)

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = undefined
  try {
    await action()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    busy.value = false
  }
}

async function sendReply() {
  const body = replyBody.value
  if (!body.trim())
    return
  await run(async () => {
    await props.reviews.reply(props.thread.rootId, body)
    replyBody.value = ''
    replying.value = false
  })
}
</script>

<template>
  <div class="font-sans my-1 text-left border border-base rounded-lg bg-base max-w-200 overflow-hidden">
    <div class="divide-#9992 divide-y">
      <ReviewCommentCard
        v-for="comment in thread.comments"
        :key="comment.id"
        :comment="comment"
        :is-viewer="!!comment.author && comment.author.login === reviews.viewerLogin"
        :busy="busy"
        @edit="run(() => reviews.editComment(comment.id, $event))"
        @delete="run(() => reviews.deleteComment(comment.id))"
      />
    </div>
    <p v-if="error" class="text-xs text-red-600 px-3 pb-1 dark:text-red-400">
      {{ error }}
    </p>
    <footer v-if="canWrite" class="px-2 py-1.5 border-t border-base bg-raised flex flex-col gap-2">
      <template v-if="replying">
        <FormTextarea
          v-model="replyBody"
          :rows="2"
          placeholder="Reply…"
          :disabled="busy"
          @keydown.enter.meta="sendReply"
          @keydown.enter.ctrl="sendReply"
        />
        <div class="flex gap-2 justify-end">
          <ActionButton size="sm" variant="text" :disabled="busy" @click="replying = false">
            Cancel
          </ActionButton>
          <ActionButton size="sm" variant="primary" :loading="busy" :disabled="!replyBody.trim()" @click="sendReply">
            Reply
          </ActionButton>
        </div>
      </template>
      <div v-else class="flex gap-2 items-center">
        <button
          v-if="!thread.pending"
          type="button"
          class="text-sm color-base px-2 py-1 text-left border border-base rounded bg-base op-fade flex-1 hover:op-100"
          @click="replying = true"
        >
          Reply…
        </button>
        <div v-else class="flex-1" />
        <ActionButton v-if="canResolve" size="sm" :disabled="busy" icon="i-ph:check-circle-duotone" @click="run(() => reviews.resolveThread(thread.threadId!))">
          Resolve
        </ActionButton>
      </div>
    </footer>
  </div>
</template>
