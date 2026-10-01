<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { settingsModalOpen } from '../../state/settingsModal'
import AnalyzeStatusModal from './AnalyzeStatusModal.vue'

const props = defineProps<{
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

const { t } = useI18n()

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
    return t('analyze.analyzing')
  if (llm.value.error)
    return t('analyze.failed')
  return hasAiResult.value ? t('analyze.reanalyze') : t('analyze.withAi')
})

const title = computed(() => {
  if (llm.value.isAnalyzing)
    return llm.value.progress?.message ?? t('analyze.analyzing')
  if (llm.value.error)
    return t('analyze.failedTitle', { message: llm.value.error.message })
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
    class="shrink-0 text-xs shadow"
    size="sm"
    icon="i-ph:key-duotone"
    variant="primary"
    @click="settingsModalOpen = true"
  >
    {{ $t('analyze.setupKeys') }}
  </ActionButton>
  <ActionButton
    v-else-if="!hasAiResult || hasStatus || store.analyzeMode !== 'rule-based'"
    class="shrink-0 text-xs"
    :variant="hasAiResult ? 'text' : 'primary'"
    :icon="icon"
    :title="title"
    @click="onClick"
  >
    {{ label }}
  </ActionButton>

  <AnalyzeStatusModal :open="statusOpen && hasStatus" :store="store" :document="document" @update:open="statusOpen = $event" />
</template>
