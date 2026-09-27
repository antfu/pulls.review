<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  store: DiffsStore
}>()

const chat = computed(() => props.store.llm!.chat)
const open = defineModel<boolean>('open', { default: false })
const input = ref('')
const busy = computed(() => chat.value.isStreaming || props.store.llm!.isAnalyzing)
const lastIndex = computed(() => chat.value.messages.length - 1)
const lastIsError = computed(() => {
  const last = chat.value.messages.at(-1)
  return last?.role === 'assistant' && last.stopReason === 'error'
})

const showThinking = computed(() => {
  if (!chat.value.isStreaming)
    return false
  const last = chat.value.messages.at(-1)
  const lastPart = last?.role === 'assistant' ? last.content.at(-1) : undefined
  return !(lastPart?.type === 'text' && lastPart.text.trim())
})

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

async function submit() {
  const text = input.value
  if (!text.trim() || busy.value)
    return
  input.value = ''
  stuckToBottom.value = true
  await chat.value.send(text)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div class="bottom-4 right-4 fixed z-dropdown">
    <ActionIconButton
      v-if="!open"
      icon="i-ph:chat-circle-dots-duotone"
      title="Ask about this PR"
      label="Ask about this PR"
      class="text-xl border border-base bg-base shadow-lg"
      @click="open = true"
    />

    <div
      v-else
      class="border border-base rounded-lg bg-base flex flex-col h-140 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] w-100 shadow-xl overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-base flex gap-2 items-center">
        <span class="i-ph:chat-circle-dots-duotone op-mute" aria-hidden="true" />
        <span class="text-sm font-semibold flex-auto">Ask about this PR</span>
        <ActionButton v-if="chat.available" size="sm" variant="text" @click="chat.clear()">
          Clear
        </ActionButton>
        <ActionIconButton compact icon="i-ph:caret-down" tooltip="Collapse" @click="open = false" />
      </div>

      <div v-if="!chat.available" class="text-sm p-6 text-center op-mute flex flex-auto items-center justify-center">
        Re-analyze to enable chat
      </div>

      <template v-else>
        <div ref="listEl" class="p-3 overscroll-contain flex-auto min-w-0 overflow-y-auto" @scroll="onScroll">
          <div ref="contentEl" class="flex flex-col gap-3">
            <ChatMessage
              v-for="(message, index) in chat.messages"
              :key="index"
              :message="message"
              :retryable="index === lastIndex && !chat.isStreaming"
              @retry="chat.retry()"
            />
            <div v-if="showThinking" class="text-xs op-mute flex gap-1.5 items-center" role="status">
              <span class="i-ph:spinner-duotone animate-spin" aria-hidden="true" />
              Thinking…
            </div>
          </div>
        </div>

        <p v-if="chat.error && !lastIsError" class="text-xs text-red-500 px-3 pb-2 break-words">
          {{ chat.error.message }}
        </p>

        <div class="p-2 border-t border-base flex gap-2 items-end">
          <textarea
            v-model="input"
            rows="2"
            placeholder="Ask about this PR…"
            aria-label="Ask about this PR"
            :disabled="busy"
            class="text-sm p-2 outline-none border border-base rounded bg-raised flex-auto resize-none disabled:op-mute focus-visible:ring-2 focus-visible:ring-primary-500/40"
            @keydown="onKeydown"
          />
          <ActionButton v-if="chat.isStreaming" size="sm" icon="i-ph:stop-duotone" @click="chat.stop()">
            Stop
          </ActionButton>
          <ActionButton v-else size="sm" variant="primary" icon="i-ph:paper-plane-right-duotone" :disabled="busy || !input.trim()" @click="submit()">
            Send
          </ActionButton>
        </div>
      </template>
    </div>
  </div>
</template>
