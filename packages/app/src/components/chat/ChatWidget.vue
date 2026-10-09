<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import { useDragResize } from '../../composables/useDragResize'
import { CHAT_PANEL_MAX_RATIO, CHAT_PANEL_MIN_WIDTH, chatPanelWidth } from '../../state/chat-panel'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  store: DiffsStore
  /** Sit beside the diffs as a full-height column of the parent flex row, instead of floating over them. */
  docked?: boolean
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

const docked = computed(() => props.docked && open.value)
const rootEl = useTemplateRef<HTMLElement>('root')
// Once dragged, the panel takes that width over its default `w-120` - capped, so the
// diffs keep the rest when the window narrows later.
const dockedStyle = computed(() => docked.value && chatPanelWidth.value
  ? { width: `min(${chatPanelWidth.value}px, ${CHAT_PANEL_MAX_RATIO * 100}%)` }
  : undefined)
const { resizing, onPointerDown: onResizeDown } = useDragResize({
  target: () => rootEl.value,
  width: chatPanelWidth,
  min: CHAT_PANEL_MIN_WIDTH,
  // Same bound as the `%` in `dockedStyle`, which resolves against the parent flex row.
  max: () => rootEl.value!.parentElement!.clientWidth * CHAT_PANEL_MAX_RATIO,
  edge: 'left',
})

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div
    ref="root"
    :class="docked ? 'relative w-120 shrink-0 border-l border-base' : 'fixed bottom-4 right-4 z-dropdown'"
    :style="dockedStyle"
  >
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
      class="flex flex-col overflow-hidden bg-base"
      :class="docked
        ? 'sticky top-[var(--diffs-header-height,0px)] h-[calc(100vh-var(--diffs-header-height,0px))]'
        : 'h-140 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] w-100 border border-base rounded-lg shadow-xl'"
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

        <div class="flex items-end gap-2 border-t border-base p-2">
          <textarea
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

    <!-- Straddles the border, so it's as tall as the panel; a double-click resets the width. -->
    <div
      v-if="docked"
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('group.resize')"
      :title="$t('group.resize')"
      class="group/resize absolute inset-y-0 left-0 w-3 flex cursor-col-resize touch-none justify-center -translate-x-1/2"
      @pointerdown="onResizeDown"
      @dblclick="chatPanelWidth = null"
    >
      <div
        class="w-px transition-colors"
        :class="resizing ? 'bg-primary-500' : 'group-hover/resize:bg-primary-500'"
      />
    </div>
  </div>
</template>
