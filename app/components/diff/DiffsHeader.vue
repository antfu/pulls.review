<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import type { GroupSource } from '../../types/analyze'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed } from 'vue'
import { parseGithubDiffId } from '../../providers/github/diff-id'
import { settingsModalOpen } from '../../state/settingsModal'
import GithubAvatar from '../GithubAvatar.vue'
import NavControls from '../NavControls.vue'
import DiffStats from './DiffStats.vue'
import { countGroupFiles } from './group-utils'
import PrStatusIcon from './PrStatusIcon.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
  store: DiffsStore
  groupsVisable: string[]
  scrollY: number
}>()

// `store.diff` is guaranteed set - `DiffsPage` only renders this component once it is.
const meta = computed(() => props.store.diff!)
const groups = computed(() => props.store.groups)
const isEmbedded = computed(() => props.store.ui.isEmbedded)
const totalFiles = computed(() => meta.value.files.length)
const reviewedCount = computed(() => meta.value.files.filter(file => props.store.reviewed.has(file.sha)).length)
const additions = computed(() => meta.value.files.reduce((sum, file) => sum + file.additions, 0))
const deletions = computed(() => meta.value.files.reduce((sum, file) => sum + file.deletions, 0))
const progress = computed(() => totalFiles.value === 0 ? 1 : reviewedCount.value / totalFiles.value)

const llmIsSetup = computed(() => props.store.llm?.isSetup ?? false)
const llmIsAnalyzing = computed(() => props.store.llm?.isAnalyzing ?? false)
const llmHasAiResult = computed(() => props.store.llm?.hasAiResult ?? false)
const llmAnalyzeMode = computed(() => props.store.llm?.analyzeMode ?? 'rule-based')
const llmProgress = computed(() => props.store.llm?.progress)
const llmError = computed(() => props.store.llm?.error)

const layoutOptions = [
  { value: 'unified', label: 'Unified', icon: 'i-ph:rows-duotone' },
  { value: 'split', label: 'Split', icon: 'i-ph:columns-duotone' },
]

const analyzeOptions = [
  { value: 'rule-based', label: 'Rules' },
  { value: 'llm', label: 'AI', icon: 'i-ph-sparkle-duotone' },
]

const githubRef = computed(() => meta.value.provider === 'github' ? parseGithubDiffId(meta.value.id) : undefined)

function scrollToGroup(key: string) {
  (props.document ?? document).getElementById(`group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <header
    class="px4 py2 border-b bg-base flex flex-col gap-2 transition-all left-0 right-0 top-0 sticky z-nav"
    :class="scrollY > 20 ? 'border-base shadow-md' : 'border-transparent' "
  >
    <div class="mxa max-w-500 w-full">
      <div class="flex flex-wrap gap-2 items-start">
        <PrStatusIcon v-if="meta.pullRequest?.state" :state="meta.pullRequest.state" class="mt-1" />
        <h1 class="text-lg font-semibold flex-auto break-words">
          {{ meta.title }}
          <a v-if="githubRef" :href="meta.url" target="_blank" rel="noopener" class="text-base font-normal op-fade hover:underline">#{{ githubRef.number }}</a>
        </h1>

        <div
          v-if="store.llm && llmHasAiResult"
          class="text-sm flex shrink-0 gap-1.5 items-center"
        >
          <span class="op-fade">Analyze by</span>
          <ActionToggleGroup
            :model-value="llmAnalyzeMode"
            :options="analyzeOptions"
            @update:model-value="store.llm?.setAnalyzeMode($event as GroupSource)"
          />
        </div>

        <ActionIconButton v-if="meta.provider === 'github'" icon="i-ph:arrows-clockwise-duotone" label="Refresh" tooltip="Refresh" class="shrink-0" @click="store.refresh()" />
        <ActionToggleGroup
          class="shrink-0"
          :model-value="store.ui.layout"
          :options="layoutOptions"
          @update:model-value="store.ui.setLayout($event as 'split' | 'unified')"
        />
        <div class="shrink-0">
          <NavControls :document="document" :is-embedded="isEmbedded" />
        </div>
      </div>

      <div class="text-sm op-fade flex flex-wrap gap-x-3 gap-y-1 items-center">
        <div v-if="githubRef && !isEmbedded" class="text-sm mb-1 op-fade flex gap-1.5 items-center">
          <span>{{ githubRef.owner }}/{{ githubRef.repo }}</span>
        </div>
        <span v-if="meta.pullRequest?.author" class="flex gap-1.5 items-center">
          <GithubAvatar :login="meta.pullRequest.author" :size="16" />
          by {{ meta.pullRequest.author }}
        </span>
        <span v-if="meta.base && meta.head && !isEmbedded" class="font-mono flex gap-1 items-center">
          <span class="font-mono px-2 py-0.5 border border-base rounded bg-code">{{ meta.base.ref }}</span>
          ←
          <span class="font-mono px-2 py-0.5 border border-base rounded bg-code">{{ meta.head.ref }}</span>
        </span>
      </div>
      <!-- <template v-if="meta.description">
      <button
        type="button"
        class="text-sm color-muted mt-1 flex gap-1 items-center hover:color-base"
        :aria-expanded="descriptionOpen"
        @click="descriptionOpen = !descriptionOpen"
      >
        <span :class="descriptionOpen ? 'i-ph:caret-down' : 'i-ph:caret-right'" aria-hidden="true" />
        Description
      </button>
      <p v-if="descriptionOpen" class="text-sm whitespace-pre-wrap">
        {{ meta.description }}
      </p>
    </template> -->

      <div class="text-sm pt-2 flex gap-2 items-center">
        <div
          v-if="groups.length > 1"
          class="text-sm flex flex-wrap gap-1.5 items-center relative"
        >
          <button
            v-for="group in groups"
            :key="group.key"
            type="button"
            class="px-2 py-0.5 border border-base rounded transition hover:bg-active hover:op-100"
            :class="groupsVisable.includes(group.key) ? 'op-100 bg-raised shadow translate-y--2px color-base' : 'op-fade'"
            @click="scrollToGroup(group.key)"
          >
            {{ group.label }}
            <span class="font-mono op-mute">{{ countGroupFiles(group) }}</span>
          </button>
        </div>

        <template v-if="store.llm">
          <ActionButton
            v-if="!llmIsSetup"
            class="text-xs shadow"
            size="sm"
            icon="i-ph:key-duotone"
            variant="primary"
            @click="settingsModalOpen = true"
          >
            Setup API Keys
          </ActionButton>
          <ActionButton
            v-else-if="!llmHasAiResult || llmAnalyzeMode === 'llm'"
            class="text-xs shadow"
            :disabled="llmIsAnalyzing"
            :variant="llmHasAiResult ? 'action' : 'primary'"
            :icon="llmIsAnalyzing ? 'i-ph:spinner-duotone animate-spin' : 'i-ph-sparkle-duotone'"
            @click="store.llm.reanalyze()"
          >
            {{ llmIsAnalyzing ? 'Analyzing…' : llmHasAiResult ? 'Re-analyze with AI' : 'Analyze with AI' }}
          </ActionButton>
          <span v-if="llmIsAnalyzing && llmProgress" class="text-xs op-mute max-w-64 truncate" :title="llmProgress.message">{{ llmProgress.message }}</span>
          <span v-else-if="llmError" class="text-xs text-red-500 max-w-80 truncate" :title="`AI analysis failed: ${llmError.message}`">AI analysis failed: {{ llmError.message }}</span>
        </template>

        <div class="flex-auto" />

        <DiffStats :additions="additions" :deletions="deletions" />
        <DisplayDonut :value="progress" :size="18" :thickness="3" />
        <span>{{ reviewedCount }} <span class="text-xs opacity-50">/ {{ totalFiles }} reviewed</span></span>
      </div>
    </div>
  </header>
</template>
