<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import type { ChatQuote } from './chat-quotes'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { withQuotes } from './chat-quotes'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  store: DiffsStore
}>()

const chat = computed(() => props.store.llm!.chat)
const open = defineModel<boolean>('open', { default: false })
/** Diff lines to send along with the next message (see `chat-quotes.ts`). */
const quotes = defineModel<ChatQuote[]>('quotes', { default: () => [] })
const input = ref('')
const inputEl = useTemplateRef<HTMLTextAreaElement>('inputEl')
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

watch(() => quotes.value.length, async (count, previous) => {
  if (count <= previous)
    return
  await nextTick()
  inputEl.value?.focus()
})

async function submit() {
  if (!input.value.trim() || busy.value)
    return
  const text = withQuotes(input.value, quotes.value)
  input.value = ''
  quotes.value = []
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
  <div class="fixed bottom-4 right-4 z-dropdown">
    <ActionIconButton
      v-if="!open"
      icon="i-ph:chat-circle-dots-duotone"
      :title="$t('chat.title')"
      :label="$t('chat.title')"
      class="border border-base bg-base text-xl shadow-lg"
      @click="open = true"
    />

    <div
      v-else
      class="h-140 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] w-100 flex flex-col overflow-hidden border border-base rounded-lg bg-base shadow-xl"
    >
      <div class="flex items-center gap-2 border-b border-base px-3 py-2">
        <span class="i-ph:chat-circle-dots-duotone op-mute" aria-hidden="true" />
        <span class="flex-auto text-sm font-semibold">{{ $t('chat.title') }}</span>
        <ActionButton v-if="chat.available" size="sm" variant="text" @click="chat.clear()">
          {{ $t('common.clear') }}
        </ActionButton>
        <ActionIconButton compact icon="i-ph:caret-down" :tooltip="$t('chat.collapse')" @click="open = false" />
      </div>

      <div v-if="!chat.available" class="flex flex-auto items-center justify-center p-6 text-center text-sm op-mute">
        {{ $t('chat.reanalyzeToEnable') }}
      </div>

      <template v-else>
        <div ref="listEl" class="min-w-0 flex-auto overflow-y-auto overscroll-contain p-3" @scroll="onScroll">
          <div ref="contentEl" class="flex flex-col gap-3">
            <ChatMessage
              v-for="(message, index) in chat.messages"
              :key="index"
              :message="message"
              :retryable="index === lastIndex && !chat.isStreaming"
              @retry="chat.retry()"
            />
            <div v-if="showThinking" class="flex items-center gap-1.5 text-xs op-mute" role="status">
              <span class="i-ph:spinner-duotone animate-spin" aria-hidden="true" />
              {{ $t('chat.thinking') }}
            </div>
          </div>
        </div>

        <p v-if="chat.error && !lastIsError" class="break-words px-3 pb-2 text-xs text-red-500">
          {{ chat.error.message }}
        </p>

        <ul v-if="quotes.length" class="max-h-24 flex flex-col gap-1 overflow-y-auto border-t border-base px-2 pt-2">
          <li
            v-for="quote in quotes"
            :key="quote.label"
            class="flex items-center gap-1.5 border border-base rounded bg-raised py-0.5 pl-2 pr-0.5 text-xs"
          >
            <span class="i-ph:code-duotone shrink-0 op-mute" aria-hidden="true" />
            <span class="min-w-0 flex-auto truncate font-mono" :title="quote.label">{{ quote.label }}</span>
            <ActionIconButton
              compact
              icon="i-ph:x"
              :label="$t('chat.removeQuote')"
              :tooltip="$t('chat.removeQuote')"
              @click="quotes = quotes.filter(other => other !== quote)"
            />
          </li>
        </ul>

        <div class="flex items-end gap-2 p-2" :class="quotes.length ? '' : 'border-t border-base'">
          <textarea
            ref="inputEl"
            v-model="input"
            rows="2"
            :placeholder="$t('chat.placeholder')"
            :aria-label="$t('chat.title')"
            :disabled="busy"
            class="flex-auto resize-none border border-base rounded bg-raised p-2 text-sm outline-none disabled:op-mute focus-visible:ring-2 focus-visible:ring-primary-500/40"
            @keydown="onKeydown"
          />
          <ActionButton v-if="chat.isStreaming" size="sm" icon="i-ph:stop-duotone" @click="chat.stop()">
            {{ $t('common.stop') }}
          </ActionButton>
          <ActionButton v-else size="sm" variant="primary" icon="i-ph:paper-plane-right-duotone" :disabled="busy || !input.trim()" @click="submit()">
            {{ $t('common.send') }}
          </ActionButton>
        </div>
      </template>
    </div>
  </div>
</template>
