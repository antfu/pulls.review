<script setup lang="ts">
import type { GroupSource } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { parentForRef } from '../../source-routes'
import { showGroupSidebar } from '../../state/group-nav'
import GithubAvatar from '../GithubAvatar.vue'
import NavControls from '../NavControls.vue'
import DiffAnalyzeButton from './DiffAnalyzeButton.vue'
import DiffGroupNav from './DiffGroupNav.vue'
import DiffGroupNavToggle from './DiffGroupNavToggle.vue'
import DiffPrMeta from './DiffPrMeta.vue'
import DiffReviewThreadsToggle from './DiffReviewThreadsToggle.vue'
import DiffShareButton from './DiffShareButton.vue'
import PrStatusIcon from './PrStatusIcon.vue'

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

const aiResult = computed(() => props.store.aiResult)
const analyzeOptions = computed(() => [
  { value: 'rule-based', label: t('pr.rules') },
  { value: aiResult.value?.source ?? 'llm', label: t('pr.ai'), icon: 'i-ph-sparkle-duotone' },
])
// Share is for results the viewer generated - a loaded shared result is credited, not re-shared.
const canShareResult = computed(() => props.store.shared && props.store.llm && aiResult.value && !aiResult.value.sharedBy)

const parent = computed(() => parentForRef(meta.value.ref))

const reviews = computed(() => props.store.reviews)

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
          <a v-if="meta.label" :href="meta.url" target="_blank" rel="noopener" class="text-base font-normal op-fade hover:underline">{{ meta.label }}</a>
          <ActionIconButton
            v-if="store.canRefresh"
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
          <NavControls :document="document">
            <!-- The sidebar only exists at `lg` and up, so the choice is only offered there. -->
            <div class="hidden lg:block">
              <DiffGroupNavToggle />
            </div>
          </NavControls>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-sm">
        <RouterLink v-if="parent && !isEmbedded" :to="parent.route" class="flex items-center gap-1.5 op-fade hover:underline">
          <span>{{ parent.label }}</span>
        </RouterLink>
        <span v-if="meta.author" class="flex items-center gap-1.5">
          <span class="op-fade">{{ $t('pr.by') }}</span>
          <GithubAvatar :login="meta.author.name" :avatar-url="meta.author.avatarUrl" :size="16" />
          <span class="op-fade">{{ meta.author.name }}</span>
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
        <DiffPrMeta v-if="showGroupSidebar" class="ml-auto" :store="store" :document="document" />
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

      <div v-if="!showGroupSidebar" class="flex items-center gap-2 pt-2 text-sm">
        <DiffGroupNav
          class="flex-auto"
          :groups="groups"
          :groups-visable="groupsVisable"
          :reviewed="store.reviewed"
          @select="scrollToGroup"
        />

        <DiffPrMeta class="ml-auto self-end pt-2" :store="store" :document="document" />
      </div>
    </div>
  </header>
</template>
