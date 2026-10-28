<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchRemoteAnalysisJob, triggerRemoteAnalysis } from '../../analyze/remote-analyze'
import { githubOauthSession, isGithubOauthAvailable } from '../../auth/github-oauth'
import { openSettings } from '../../state/settingsModal'
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

// Server-side analysis: only for a signed-in viewer on a GitHub PR (hosted app,
// never the embed). The Worker runs pi with the viewer's synced key and saves
// the finished result in the backend for this PR view.
const prCoordinates = computed(() => {
  const ref = props.store.diff?.ref
  return ref?.kind === 'github-pr'
    ? { owner: ref.owner, repo: ref.repo, number: Number(ref.number) }
    : undefined
})
const canRemoteAnalyze = computed(() =>
  isGithubOauthAvailable() && !!githubOauthSession.value && !!prCoordinates.value)
const remoteState = ref<'idle' | 'queueing' | 'queued' | 'running' | 'done'>('idle')
const remoteBusy = computed(() => remoteState.value === 'queueing' || remoteState.value === 'queued' || remoteState.value === 'running')
const remoteError = ref<string>()
let pollGeneration = 0
onBeforeUnmount(() => pollGeneration++)

async function pollRemoteJob(jobId: string, generation: number) {
  // ~10 minutes at a 4s cadence; the job keeps running server-side after that.
  for (let attempt = 0; attempt < 150; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 4000))
    if (generation !== pollGeneration)
      return
    const job = await fetchRemoteAnalysisJob(jobId).catch(() => undefined)
    if (generation !== pollGeneration || !job)
      continue
    if (job.status === 'running') {
      remoteState.value = 'running'
    }
    else if (job.status === 'succeeded') {
      remoteState.value = 'done'
      await props.store.refresh()
      return
    }
    else if (job.status === 'failed' || job.status === 'superseded' || job.status === 'cancelled' || job.status === 'skipped') {
      remoteState.value = 'idle'
      remoteError.value = job.errorMessage ?? t('analyze.failed')
      return
    }
  }
  if (generation === pollGeneration)
    remoteState.value = 'done'
}

async function onRemoteClick() {
  if (!prCoordinates.value || remoteBusy.value)
    return
  remoteState.value = 'queueing'
  remoteError.value = undefined
  try {
    const queued = await triggerRemoteAnalysis(prCoordinates.value)
    remoteState.value = 'queued'
    if (queued.jobId)
      void pollRemoteJob(queued.jobId, ++pollGeneration)
  }
  catch (err) {
    remoteState.value = 'idle'
    remoteError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <ActionButton
    v-if="!llm.isSetup"
    class="shrink-0 text-xs shadow"
    size="sm"
    icon="i-ph:key-duotone"
    variant="primary"
    @click="openSettings('ai')"
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

  <ActionButton
    v-if="canRemoteAnalyze"
    class="shrink-0 text-xs"
    variant="text"
    :disabled="remoteBusy"
    :icon="remoteBusy ? 'i-ph:spinner-duotone animate-spin' : remoteState === 'done' ? 'i-ph:check-circle-duotone' : 'i-ph:cloud-arrow-up-duotone'"
    :title="remoteError ?? $t('analyze.remoteTitle')"
    @click="onRemoteClick"
  >
    {{ remoteState === 'running' ? $t('analyze.analyzing') : remoteState === 'queued' || remoteState === 'done' ? $t('analyze.remoteQueued') : $t('analyze.remote') }}
  </ActionButton>
  <span v-if="remoteError" class="max-w-80 self-center truncate text-xs text-red-500" :title="remoteError">{{ remoteError }}</span>

  <AnalyzeStatusModal :open="statusOpen && hasStatus" :store="store" :document="document" @update:open="statusOpen = $event" />
</template>
