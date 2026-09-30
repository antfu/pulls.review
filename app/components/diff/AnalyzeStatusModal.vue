<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import AppModal from '../AppModal.vue'
import ChatMessage from '../chat/ChatMessage.vue'

const props = defineProps<{
  open: boolean
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

// Only opened when `store.llm` is set - `DiffAnalyzeButton` gates on it.
const llm = computed(() => props.store.llm!)

// The system prompt and the diff-carrying prompts are noise here; the agent's own turns are the story.
const messages = computed(() => llm.value.transcript.filter(message => message.role === 'assistant' || message.role === 'toolResult'))

const listEl = useTemplateRef<HTMLDivElement>('listEl')
const contentEl = useTemplateRef<HTMLDivElement>('contentEl')
const stuckToBottom = ref(true)

function onScroll() {
  const el = listEl.value
  if (el)
    stuckToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

// Markdown renders async (Suspense), so follow the content's real size rather than message changes.
useResizeObserver(contentEl, () => {
  if (stuckToBottom.value && listEl.value)
    listEl.value.scrollTop = listEl.value.scrollHeight
})

function rerun() {
  stuckToBottom.value = true
  llm.value.reanalyze()
}
</script>

<template>
  <AppModal
    title="AI analysis"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3 max-h-[60vh]">
      <div ref="listEl" class="overscroll-contain flex-auto min-w-0 overflow-y-auto" @scroll="onScroll">
        <div ref="contentEl" class="flex flex-col gap-3">
          <ChatMessage v-for="(message, index) in messages" :key="index" :message="message" />
          <div v-if="llm.isAnalyzing" class="text-xs op-mute flex gap-1.5 items-center" role="status">
            <span class="i-ph:spinner-duotone animate-spin" aria-hidden="true" />
            {{ llm.progress?.message ?? 'Starting…' }}
          </div>
        </div>
      </div>

      <p v-if="llm.error" class="text-sm text-red-600 break-words dark:text-red-400">
        {{ llm.error.message }}
      </p>
    </div>

    <template #footer>
      <ActionButton v-if="llm.isAnalyzing" size="sm" icon="i-ph:stop-duotone" @click="llm.abort()">
        Abort
      </ActionButton>
      <ActionButton v-else size="sm" variant="primary" icon="i-ph:arrow-clockwise-duotone" @click="rerun">
        Rerun
      </ActionButton>
    </template>
  </AppModal>
</template>
