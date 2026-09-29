<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import type { GroupSource } from '../../types/analyze'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed, ref } from 'vue'
import { parseGithubDiffId } from '../../providers/github/diff-id'
import GithubAvatar from '../GithubAvatar.vue'
import NavControls from '../NavControls.vue'
import DiffAnalyzeButton from './DiffAnalyzeButton.vue'
import DiffGroupNav from './DiffGroupNav.vue'
import DiffReviewButton from './DiffReviewButton.vue'
import DiffReviewThreadsToggle from './DiffReviewThreadsToggle.vue'
import DiffShareButton from './DiffShareButton.vue'
import DiffStats from './DiffStats.vue'
import PrStatusIcon from './PrStatusIcon.vue'
import ReviewSubmitModal from './ReviewSubmitModal.vue'

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

const aiResult = computed(() => props.store.aiResult)
const analyzeOptions = computed(() => [
  { value: 'rule-based', label: 'Rules' },
  { value: aiResult.value?.source ?? 'llm', label: 'AI', icon: 'i-ph-sparkle-duotone' },
])
// Share is for results the viewer generated - a loaded shared result is credited, not re-shared.
const canShareResult = computed(() => props.store.shared && props.store.llm && aiResult.value && !aiResult.value.sharedBy)

const githubRef = computed(() => meta.value.provider === 'github' ? parseGithubDiffId(meta.value.id) : undefined)

const reviews = computed(() => props.store.reviews)
const reviewModalOpen = ref(false)

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
        <h1 class="text-lg font-semibold flex flex-auto gap-2 break-words items-center">
          {{ meta.title }}
          <a v-if="githubRef" :href="meta.url" target="_blank" rel="noopener" class="text-base font-normal op-fade hover:underline">#{{ githubRef.number }}</a>
          <ActionIconButton
            v-if="meta.provider === 'github'"
            icon="i-ph:arrows-clockwise-duotone"
            label="Refresh" tooltip="Refresh"
            class="text-sm shrink-0" @click="store.refresh()"
          />
        </h1>

        <div
          v-if="aiResult"
          class="text-sm flex shrink-0 gap-1.5 items-center"
        >
          <span class="op-fade">Analyze by</span>
          <ActionToggleGroup
            :model-value="store.analyzeMode"
            :options="analyzeOptions"
            @update:model-value="store.setAnalyzeMode($event as GroupSource)"
          />
        </div>

        <DiffReviewThreadsToggle
          v-if="reviews"
          :show-threads="reviews.showThreads"
          @update:show-threads="reviews.setShowThreads($event)"
        />
        <div class="shrink-0">
          <NavControls :document="document" :is-embedded="isEmbedded" />
        </div>
      </div>

      <div class="text-sm text-sm flex flex-wrap gap-x-3 gap-y-1 items-center">
        <a v-if="githubRef && !isEmbedded" :href="meta.url" target="_blank" rel="noopener" class="op-fade flex gap-1.5 items-center">
          <span>{{ githubRef.owner }}/{{ githubRef.repo }}</span>
        </a>
        <span v-if="meta.pullRequest?.author" class="flex gap-1.5 items-center">
          <span class="op-fade">by</span>
          <GithubAvatar :login="meta.pullRequest.author" :size="16" />
          <span class="op-fade">{{ meta.pullRequest.author }}</span>
        </span>
        <span v-if="meta.base && meta.head && !isEmbedded" class="font-mono flex gap-1 items-center">
          <span class="text-xs font-mono px-2 py-0.5 border border-base rounded bg-code">{{ meta.base.ref }}</span>
          ←
          <span class="text-xs font-mono px-2 py-0.5 border border-base rounded bg-code">{{ meta.head.ref }}</span>
        </span>
        <span v-if="aiResult?.sharedBy && store.analyzeMode !== 'rule-based'" class="px2 border border-base rounded flex gap-1.5 items-center" :title="aiResult.model">
          Viewing AI analysis shared by
          <GithubAvatar :login="aiResult.sharedBy" :size="16" />
          {{ aiResult.sharedBy }}
        </span>
        <DiffAnalyzeButton v-if="store.llm" :store="store" />
        <DiffShareButton v-if="canShareResult" :store="store" :document="document" />
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
        <DiffGroupNav
          class="flex-auto"
          :groups="groups"
          :groups-visable="groupsVisable"
          :reviewed="store.reviewed"
          @select="scrollToGroup"
        />

        <DiffStats :additions="additions" :deletions="deletions" />
        <DisplayDonut :value="progress" :size="18" :thickness="3" />
        <span class="shrink-0 whitespace-nowrap">{{ reviewedCount }} <span class="text-xs opacity-50">/ {{ totalFiles }} reviewed</span></span>
        <DiffReviewButton
          v-if="reviews?.canWrite"
          :pending-comment-count="reviews.pendingCommentCount"
          @review="reviewModalOpen = true"
        />
      </div>
    </div>

    <ReviewSubmitModal
      v-if="reviews"
      v-model:open="reviewModalOpen"
      :reviews="reviews"
      :document="document"
    />
  </header>
</template>
