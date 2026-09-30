<script setup lang="ts">
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ToolCall } from '@earendil-works/pi-ai'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { Markdown } from '@comark/vue'
import { computed } from 'vue'

const props = defineProps<{
  message: AgentMessage
  retryable?: boolean
}>()

defineEmits<{ retry: [] }>()

function textOf(content: string | { type: string, text?: string }[]) {
  return typeof content === 'string' ? content : content.map(part => part.text ?? '').join('\n')
}

const userText = computed(() => props.message.role === 'user' ? textOf(props.message.content) : '')

const groupingNotice = computed(() => {
  const message = props.message
  if (message.role !== 'toolResult' || message.toolName !== 'update_grouping' || message.isError)
    return undefined
  const count = textOf(message.content).match(/(\d+) groups?/)?.[1]
  return count ? `Updated grouping: ${count} groups` : undefined
})

const toolError = computed(() => {
  const message = props.message
  return message.role === 'toolResult' && message.isError ? textOf(message.content) : undefined
})

function toolCallLabel(call: ToolCall) {
  if (call.name === 'read_diffs') {
    const paths = call.arguments.paths
    return `Read ${Array.isArray(paths) ? paths.length : 0} file(s)`
  }
  if (call.name === 'update_grouping')
    return 'Updating grouping…'
  if (call.name === 'submit_grouping')
    return 'Submitting grouping…'
  return call.name
}
</script>

<template>
  <div v-if="message.role === 'user'" class="flex justify-end">
    <div class="text-sm px-3 py-2 rounded-lg bg-active max-w-[85%] whitespace-pre-wrap break-words">
      {{ userText }}
    </div>
  </div>

  <div v-else-if="message.role === 'assistant'" class="flex flex-col gap-1.5 max-w-full items-start">
    <template v-for="(part, index) in message.content" :key="index">
      <Suspense v-if="part.type === 'text' && part.text.trim()">
        <Markdown :value="part.text" :streaming="message.stopReason === 'pending'" class="chat-md min-w-0 self-stretch" />
      </Suspense>
      <div v-else-if="part.type === 'toolCall'" class="text-xs op-mute flex gap-1.5 items-center">
        <span class="i-ph:wrench-duotone" aria-hidden="true" />
        {{ toolCallLabel(part) }}
      </div>
    </template>
    <div v-if="message.stopReason === 'error'" class="text-sm text-red-500 flex flex-wrap gap-2 items-center">
      <span class="break-words">{{ message.errorMessage ?? 'Request failed' }}</span>
      <ActionButton v-if="retryable" size="sm" icon="i-ph:arrow-clockwise-duotone" @click="$emit('retry')">
        Retry
      </ActionButton>
    </div>
    <span v-else-if="message.stopReason === 'aborted'" class="text-xs px-1.5 border border-base rounded op-mute">stopped</span>
  </div>

  <div v-else-if="groupingNotice" class="text-xs op-mute flex gap-1.5 items-center">
    <span class="i-ph:tree-structure-duotone" aria-hidden="true" />
    {{ groupingNotice }}
  </div>

  <div v-else-if="toolError" class="text-xs op-mute flex gap-1.5 items-start">
    <span class="i-ph:warning-duotone mt-0.5 shrink-0" aria-hidden="true" />
    <span class="whitespace-pre-wrap break-words">{{ toolError }}</span>
  </div>
</template>

<style scoped>
.chat-md {
  @apply text-sm leading-relaxed break-words;
}
.chat-md
  :deep(
    :is(p, ul, ol, pre, blockquote, table, hr, h1, h2, h3, h4)
      + :is(p, ul, ol, pre, blockquote, table, hr, h1, h2, h3, h4)
  ) {
  @apply mt-2.5;
}
.chat-md :deep(:is(h1, h2, h3, h4)) {
  @apply font-semibold leading-snug;
}
.chat-md :deep(:is(h1, h2)) {
  @apply text-base;
}
.chat-md :deep(:is(h3, h4)) {
  @apply text-sm;
}
.chat-md :deep(* + :is(h1, h2, h3, h4)) {
  @apply mt-4;
}
.chat-md :deep(:is(ul, ol)) {
  @apply pl-5;
}
.chat-md :deep(ul) {
  @apply list-disc;
}
.chat-md :deep(ol) {
  @apply list-decimal;
}
.chat-md :deep(li + li) {
  @apply mt-1;
}
.chat-md :deep(:not(pre) > code) {
  @apply text-[0.85em] px-1 py-0.5 rounded bg-code;
}
.chat-md :deep(pre) {
  @apply text-xs leading-relaxed p-3 border border-base rounded-md bg-code max-w-full overflow-x-auto;
}
.chat-md :deep(pre code) {
  @apply whitespace-pre;
}
.chat-md :deep(blockquote) {
  @apply pl-3 border-l-2 border-base op-fade;
}
.chat-md :deep(table) {
  @apply text-xs block max-w-full overflow-x-auto border-collapse;
}
.chat-md :deep(:is(th, td)) {
  @apply px-2 py-1 border border-base text-left;
}
.chat-md :deep(a) {
  @apply underline underline-offset-2 hover:op-80;
}
.chat-md :deep(hr) {
  @apply border-base;
}
</style>
