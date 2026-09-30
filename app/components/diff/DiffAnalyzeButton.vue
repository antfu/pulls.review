<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, ref } from 'vue'
import { settingsModalOpen } from '../../state/settingsModal'
import AnalyzeStatusModal from './AnalyzeStatusModal.vue'

const props = defineProps<{
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

// Only rendered when `store.llm` is set - `DiffsHeader` gates on it.
const llm = computed(() => props.store.llm!)
const hasAiResult = computed(() => props.store.aiResult !== undefined)
// Running or failed: the button opens the status dialog instead of starting a run.
const hasStatus = computed(() => llm.value.isAnalyzing || llm.value.error !== undefined)
const statusOpen = ref(false)

const icon = computed(() => {
  if (llm.value.isAnalyzing)
    return 'i-ph:spinner-duotone animate-spin'
  if (llm.value.error)
    return `i-ph:warning-circle-duotone ${hasAiResult.value ? 'text-red-500' : 'text-red-100'}`
  return 'i-ph:sparkle-duotone'
})

const label = computed(() => {
  if (llm.value.isAnalyzing)
    return 'Analyzing…'
  if (llm.value.error)
    return 'Analysis failed'
  return hasAiResult.value ? 'Re-analyze' : 'Analyze with AI'
})

const title = computed(() => {
  if (llm.value.isAnalyzing)
    return llm.value.progress?.message ?? 'Analyzing…'
  if (llm.value.error)
    return `AI analysis failed: ${llm.value.error.message}`
  return undefined
})

function onClick() {
  if (hasStatus.value)
    statusOpen.value = true
  else
    llm.value.reanalyze()
}
</script>

<template>
  <ActionButton
    v-if="!llm.isSetup"
    class="text-xs shrink-0 shadow"
    size="sm"
    icon="i-ph:key-duotone"
    variant="primary"
    @click="settingsModalOpen = true"
  >
    Setup API Keys
  </ActionButton>
  <ActionButton
    v-else-if="!hasAiResult || hasStatus || store.analyzeMode !== 'rule-based'"
    class="text-xs shrink-0"
    :variant="hasAiResult ? 'text' : 'primary'"
    :icon="icon"
    :title="title"
    @click="onClick"
  >
    {{ label }}
  </ActionButton>

  <AnalyzeStatusModal :open="statusOpen && hasStatus" :store="store" :document="document" @update:open="statusOpen = $event" />
</template>
