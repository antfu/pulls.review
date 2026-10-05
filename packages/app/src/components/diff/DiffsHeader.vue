<script setup lang="ts">
import type { GroupSource } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { showGroupSidebar } from '../../state/group-nav'
import GithubAvatar from '../GithubAvatar.vue'
import NavControls from '../NavControls.vue'
import DiffAnalyzeButton from './DiffAnalyzeButton.vue'
import DiffGroupNav from './DiffGroupNav.vue'
import DiffGroupNavToggle from './DiffGroupNavToggle.vue'
import DiffReviewButton from './DiffReviewButton.vue'
import DiffReviewThreadsToggle from './DiffReviewThreadsToggle.vue'
import DiffShareButton from './DiffShareButton.vue'
import DiffStats from './DiffStats.vue'
import PrStatusIcon from './PrStatusIcon.vue'
import ReviewProgressModal from './ReviewProgressModal.vue'
import ReviewSubmitModal from './ReviewSubmitModal.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
  store: DiffsStore
  groupsVisable: string[]
  scrollY: number
}>()

const { t } = useI18n()

// `store.diff` is guaranteed set - `DiffsPage` only renders this component once it is.
const meta = computed(() => props.store.diff!)
const groups = computed(() => props.store.groups)
// The embedded view keys off the compile-time `PR_EMBED` flag instead of a runtime flag
// threaded down from the store.
const isEmbedded = import.meta.env.PR_EMBED
const totalFiles = computed(() => meta.value.files.length)
const reviewedCount = computed(() => meta.value.files.filter(file => props.store.reviewed.has(file.sha)).length)
const additions = computed(() => meta.value.files.reduce((sum, file) => sum + file.additions, 0))
const deletions = computed(() => meta.value.files.reduce((sum, file) => sum + file.deletions, 0))
const progress = computed(() => totalFiles.value === 0 ? 1 : reviewedCount.value / totalFiles.value)

const aiResult = computed(() => props.store.aiResult)
const analyzeOptions = computed(() => [
  { value: 'rule-based', label: t('pr.rules') },
  { value: aiResult.value?.source ?? 'llm', label: t('pr.ai'), icon: 'i-ph-sparkle-duotone' },
])
// Share is for results the viewer generated - a loaded shared result is credited, not re-shared.
const canShareResult = computed(() => props.store.shared && props.store.llm && aiResult.value && !aiResult.value.sharedBy)

const githubRef = computed(() => meta.value.ref.kind === 'github-pr' ? meta.value.ref : undefined)

const reviews = computed(() => props.store.reviews)
const reviewModalOpen = ref(false)
const progressModalOpen = ref(false)

function scrollToGroup(key: string) {
  (props.document ?? document).getElementById(`group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <header
    class="sticky left-0 right-0 top-0 z-nav flex flex-col gap-2 border-b bg-base px4 py2 transition-all"
    :class="scrollY > 20 ? 'border-base shadow-sm' : 'border-transparent' "
  >
    <div class="mxa max-w-500 w-full">
      <div class="flex flex-wrap items-center gap-2">
        <component :is="isEmbedded ? 'div' : RouterLink" to="/" class="flex">
          <PrStatusIcon v-if="meta.pullRequest?.state" :state="meta.pullRequest.state" />
          <div v-else class="i-ph-house-line-duotone" />
        </component>
        <h1 class="flex flex-auto items-center gap-2 break-words text-lg font-semibold">
          {{ meta.title }}
          <a v-if="githubRef" :href="meta.url" target="_blank" rel="noopener" class="text-base font-normal op-fade hover:underline">#{{ githubRef.number }}</a>
          <ActionIconButton
            v-if="githubRef"
            icon="i-ph:arrows-clockwise-duotone"
            :label="$t('common.refresh')" :tooltip="$t('common.refresh')"
            class="shrink-0 text-sm" @click="store.refresh()"
          />
        </h1>

        <div
          v-if="aiResult"
          class="flex shrink-0 items-center gap-1.5 text-sm"
        >
          <span class="op-fade">{{ $t('pr.analyzeBy') }}</span>
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
          <NavControls :document="document" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-sm">
        <RouterLink v-if="githubRef && !isEmbedded" :to="`/gh/${githubRef.owner}/${githubRef.repo}`" class="flex items-center gap-1.5 op-fade hover:underline">
          <span>{{ githubRef.owner }}/{{ githubRef.repo }}</span>
        </RouterLink>
        <span v-if="meta.pullRequest?.author" class="flex items-center gap-1.5">
          <span class="op-fade">{{ $t('pr.by') }}</span>
          <GithubAvatar :login="meta.pullRequest.author" :size="16" />
          <span class="op-fade">{{ meta.pullRequest.author }}</span>
        </span>
        <span v-if="meta.base && meta.head && !isEmbedded" class="flex items-center gap-1 font-mono">
          <span class="border border-base rounded bg-code px-2 py-0.5 text-xs font-mono">{{ meta.base.ref }}</span>
          ←
          <span class="border border-base rounded bg-code px-2 py-0.5 text-xs font-mono">{{ meta.head.ref }}</span>
        </span>
        <span v-if="aiResult?.sharedBy && store.analyzeMode !== 'rule-based'" class="flex items-center gap-1.5 border border-base rounded px2" :title="aiResult.model">
          {{ $t('pr.sharedBy') }}
          <GithubAvatar :login="aiResult.sharedBy" :size="16" />
          {{ aiResult.sharedBy }}
        </span>
        <DiffAnalyzeButton v-if="store.llm" :store="store" :document="document" />
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

      <div class="flex items-center gap-2 pt-2 text-sm">
        <DiffGroupNav
          v-if="!showGroupSidebar"
          class="flex-auto"
          :groups="groups"
          :groups-visable="groupsVisable"
          :reviewed="store.reviewed"
          @select="scrollToGroup"
        />

        <div class="ml-auto flex items-center self-end gap-2 pt-2 text-sm">
          <!-- The sidebar only exists at `lg` and up, so the choice is only offered there. -->
          <div class="hidden lg:block">
            <DiffGroupNavToggle />
          </div>
          <DiffStats :additions="additions" :deletions="deletions" />
          <button
            type="button"
            class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-1.5 py-0.5 transition -mx-1.5 hover:bg-hover"
            :title="$t('reviewProgress.title')"
            :aria-expanded="progressModalOpen"
            @click="progressModalOpen = true"
          >
            <DisplayDonut :value="progress" :size="18" :thickness="3" />
            <span>{{ reviewedCount }} <span class="text-xs opacity-50">{{ $t('pr.reviewedOf', { total: totalFiles }) }}</span></span>
          </button>
          <DiffReviewButton
            v-if="reviews?.canWrite"
            :pending-comment-count="reviews.pendingCommentCount"
            @review="reviewModalOpen = true"
          />
        </div>
      </div>
    </div>

    <ReviewSubmitModal
      v-if="reviews"
      v-model:open="reviewModalOpen"
      :reviews="reviews"
      :document="document"
    />
    <ReviewProgressModal
      v-model:open="progressModalOpen"
      :store="store"
      :document="document"
    />
  </header>
</template>
