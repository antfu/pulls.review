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
    :title="$t('analyze.statusTitle')"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="max-h-[60vh] min-h-40 flex flex-col gap-3">
      <div ref="listEl" class="min-w-0 flex-auto overflow-y-auto overscroll-contain" @scroll="onScroll">
        <div ref="contentEl" class="flex flex-col gap-3">
          <ChatMessage v-for="(message, index) in messages" :key="index" :message="message" />
          <div v-if="llm.isAnalyzing" class="flex items-center gap-1.5 text-xs op-mute" role="status">
            <span class="i-ph:spinner-duotone animate-spin" aria-hidden="true" />
            {{ llm.progress?.message ?? $t('analyze.starting') }}
          </div>
        </div>
      </div>

      <p v-if="llm.error" class="break-words text-sm text-red-600 dark:text-red-400">
        {{ llm.error.message }}
      </p>
    </div>

    <template #footer>
      <ActionButton v-if="llm.isAnalyzing" size="sm" icon="i-ph:stop-duotone" @click="llm.abort()">
        {{ $t('common.abort') }}
      </ActionButton>
      <ActionButton v-else size="sm" variant="primary" icon="i-ph:arrow-clockwise-duotone" @click="rerun">
        {{ $t('common.rerun') }}
      </ActionButton>
    </template>
  </AppModal>
</template>
