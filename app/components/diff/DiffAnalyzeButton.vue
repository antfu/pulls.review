<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed } from 'vue'
import { settingsModalOpen } from '../../state/settingsModal'

const props = defineProps<{
  store: DiffsStore
}>()

// Only rendered when `store.llm` is set - `DiffsHeader` gates on it.
const llm = computed(() => props.store.llm!)
const hasAiResult = computed(() => props.store.aiResult !== undefined)
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
    v-else-if="!hasAiResult || store.analyzeMode !== 'rule-based'"
    class="text-xs shrink-0"
    :disabled="llm.isAnalyzing"
    :variant="hasAiResult ? 'text' : 'primary'"
    :icon="llm.isAnalyzing ? 'i-ph:spinner-duotone animate-spin' : 'i-ph-sparkle-duotone'"
    @click="llm.reanalyze()"
  >
    {{ llm.isAnalyzing ? 'Analyzing…' : hasAiResult ? 'Re-analyze' : 'Analyze with AI' }}
  </ActionButton>
  <span v-if="llm.isAnalyzing && llm.progress" class="text-xs op-mute max-w-64 truncate self-center" :title="llm.progress.message">{{ llm.progress.message }}</span>
  <span v-else-if="llm.error" class="text-xs text-red-500 max-w-80 truncate self-center" :title="`AI analysis failed: ${llm.error.message}`">AI analysis failed: {{ llm.error.message }}</span>
</template>
