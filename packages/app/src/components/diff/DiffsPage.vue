<script setup lang="ts">
import type { CommitNav } from '../../composables/useCommitView'
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { Markdown } from '@comark/vue'
import { Virtualizer } from '@pierre/diffs'
import { useElementBounding, useElementSize, useEventListener } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, useId, useTemplateRef, watch } from 'vue'
import { useDragResize } from '../../composables/useDragResize'
import { autoRefresh } from '../../state/auto-refresh'
import { GROUP_SIDEBAR_MAX_RATIO, GROUP_SIDEBAR_MIN_WIDTH, groupSidebarWidth, isWide, showGroupSidebar } from '../../state/group-nav'
import { scrollBehavior } from '../../state/smooth-scroll'
import GithubTokenRecovery from '../settings/GithubTokenRecovery.vue'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffGroup from './DiffGroup.vue'
import DiffGroupSidebar from './DiffGroupSidebar.vue'
import DiffsHeader from './DiffsHeader.vue'
import { fileCollapseKey } from './file-collapse'
import ReviewSummaries from './ReviewSummaries.vue'
import SharedAnalysisBanner from './SharedAnalysisBanner.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
  store?: DiffsStore
  commitNav?: CommitNav
}>()

// Compile-time: with LLM support off `store.llm` is never set, so the widget is dead code.
const ChatWidget = import.meta.env.PR_LLM
  ? defineAsyncComponent(() => import('../chat/ChatWidget.vue'))
  : undefined

const diff = computed(() => props.store?.diff)
const grouped = computed(() => props.store?.grouped)
const isLoading = computed(() => props.store?.isLoading ?? false)
const error = computed(() => props.store?.error)
const isStale = computed(() => props.store?.isStale ?? false)
const groups = computed(() => props.store?.groups ?? [])

// Inside the embed this component's own root is the `overflow-auto` scroller (see
// `EmbedApp.ce.vue`); on the site the window scrolls. In element mode the virtualizer
// watches `root.firstElementChild` for scroll-height changes, hence the single inner
// wrapper. `FileDiff`s mount first and connect early; the virtualizer queues them until `setup()`.
const virtualizer = new Virtualizer()
provide(diffVirtualizerKey, virtualizer)
provide(fileCollapseKey, reactive(new Map<string, boolean>()))
const rootEl = useTemplateRef<HTMLElement>('root')
onMounted(() => {
  virtualizer.setup(props.document && !(props.document instanceof Document) ? rootEl.value! : document)
})
onBeforeUnmount(() => virtualizer.cleanUp())

// Each DiffGroup collapses itself (both its tree and its diffs together) - all
// expanded by default.
const collapsedGroups = ref(new Set<string>())
function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  collapsedGroups.value = next
}

// `scroll` doesn't bubble, but a capture-phase listener still sees it on the way down
// regardless - attaching on `props.document` (the embed's shadow root, where the actual
// scrolling element is a descendant `overflow-auto` div) or the real `document` (the
// main site, where the page itself scrolls) both work the same way.
const scrollY = ref(0)
// Where the current downward run started; any upward scroll restarts it.
let scrollDownFrom = 0
const scrolledDownBy = ref(0)
useEventListener(() => props.document ?? document, 'scroll', (event) => {
  const y = event.target instanceof Element ? event.target.scrollTop : window.scrollY
  if (y < scrollY.value)
    scrollDownFrom = y
  scrolledDownBy.value = y - scrollDownFrom
  scrollY.value = y
  updateVisibleGroups()
  updateVisibleFiles()
}, { capture: true })

// The sticky DiffsHeader's height drives every sticky offset below it: its real,
// measured height is published as the `--diffs-header-height` CSS variable on the root
// (DiffGroup asides and section scroll-margins read it) and reused here so a group only
// counts as "visible" once it's scrolled past the header, not merely past the viewport top.
const headerRef = useTemplateRef<{ $el: HTMLElement }>('header')
const { height: headerHeight } = useElementBounding(() => headerRef.value?.$el)
// Below `lg` the header eats a big share of the screen, so it slides away after a long
// scroll down and comes back on any scroll up. Sticky offsets then collapse to the top.
const headerHidden = computed(() => !isWide.value && scrolledDownBy.value > 300)
const headerOffset = computed(() => headerHidden.value ? 0 : headerHeight.value)
const DESCRIPTION_COLLAPSED_HEIGHT = 160
const groupsVisable = ref<string[]>([])
const descriptionId = useId()
const descriptionVisible = ref(false)
const descriptionOpen = ref(false)
const descriptionBodyRef = useTemplateRef<HTMLElement>('descriptionBody')
const { height: descriptionHeight } = useElementSize(descriptionBodyRef)
const descriptionCollapsible = computed(() => descriptionHeight.value > DESCRIPTION_COLLAPSED_HEIGHT)
const descriptionClamped = computed(() => descriptionCollapsible.value && !descriptionOpen.value)
function updateVisibleGroups() {
  const root = props.document ?? document
  const viewportHeight = window.innerHeight
  const descriptionRect = root.getElementById(descriptionId)?.getBoundingClientRect()
  descriptionVisible.value = !!descriptionRect && descriptionRect.bottom > headerHeight.value && descriptionRect.top < viewportHeight
  const keys = groups.value.flatMap(group => [group.key, ...group.children.map(child => child.key)])
  groupsVisable.value = keys.filter((key) => {
    const el = root.getElementById(`group-${key}`)
    if (!el)
      return false
    const rect = el.getBoundingClientRect()
    return rect.bottom > headerOffset.value && rect.top < viewportHeight
  })
}
// Groups render async (v-for over `groups`), so the first measurement has to wait for
// that DOM to actually exist - re-run whenever the group list or header height changes.

// A file's header is sticky, so its rect can't tell where the file sits. DiffGroup puts a
// non-sticky marker before each FileDiff instead: a file spans from its marker to the
// next marker in the same column, or to the column's end.
const filesVisible = ref<string[]>([])
function updateVisibleFiles() {
  const root = props.document ?? document
  const viewportHeight = window.innerHeight
  const markers = [...root.querySelectorAll<HTMLElement>('[data-file-start]')]
  filesVisible.value = markers.filter((marker, i) => {
    const next = markers[i + 1]
    const top = marker.getBoundingClientRect().top
    const bottom = next && next.parentElement === marker.parentElement
      ? next.getBoundingClientRect().top
      : marker.parentElement!.getBoundingClientRect().bottom
    return bottom > headerOffset.value && top < viewportHeight
  }).map(marker => marker.dataset.fileStart!)
}

watch([groups, headerOffset], () => nextTick(() => {
  updateVisibleGroups()
  updateVisibleFiles()
}), { immediate: true })

function scrollToGroup(key: string) {
  (props.document ?? document).getElementById(`group-${key}`)?.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
}

function selectDescription() {
  descriptionOpen.value = true
  ;(props.document ?? document).getElementById(descriptionId)?.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
}

// Once dragged, the sidebar takes that width over its default `w-64` - capped, so the
// diffs keep the rest when the window narrows later.
const sidebarStyle = computed(() => groupSidebarWidth.value
  ? { width: `min(${groupSidebarWidth.value}px, ${GROUP_SIDEBAR_MAX_RATIO * 100}%)` }
  : undefined)
const sidebarRowEl = useTemplateRef<HTMLElement>('sidebarRow')
const sidebarEl = useTemplateRef<HTMLElement>('sidebar')
const { resizing: resizingSidebar, onPointerDown: onSidebarResizeDown } = useDragResize({
  target: () => sidebarEl.value,
  width: groupSidebarWidth,
  min: GROUP_SIDEBAR_MIN_WIDTH,
  // Same bound as the `%` in `sidebarStyle`, which resolves against this flex row.
  max: () => sidebarRowEl.value!.clientWidth * GROUP_SIDEBAR_MAX_RATIO,
})

const styles = computed(() => {
  return {
    '--diffs-header-height': headerHeight.value ? `${headerOffset.value}px` : undefined,
  }
})

// The stale banner only shows while auto-refresh is off, so the checkbox is a local
// opt-in nudge (default checked) rather than a mirror of the persisted preference -
// the click on Refresh is what commits that choice to `autoRefresh` for next time.
const autoRefreshNextTime = ref(true)
function refreshFromBanner() {
  autoRefresh.value = autoRefreshNextTime.value
  props.store?.refresh()
}
</script>

<template>
  <div
    ref="root"
    class="diffs-page bg-base color-base"
    :style="styles"
  >
    <div>
      <template v-if="isLoading && !diff">
        <div class="mxa max-w-500 w-full px-4 py-12">
          <slot name="loading">
            <FeedbackLoading :text="$t('common.loading')" />
          </slot>
        </div>
      </template>
      <template v-else-if="error">
        <div class="mxa max-w-500 w-full flex flex-col gap-8 px-4 py-12">
          <slot name="error" :error="error" :retry="() => store?.load()">
            <FeedbackEmptyState icon="i-ph:warning-duotone" :title="$t('pr.somethingWrong')">
              <template #hint>
                {{ error.message }}
              </template>
              <template #actions>
                <ActionButton variant="primary" @click="store?.load()">
                  {{ $t('common.retry') }}
                </ActionButton>
              </template>
            </FeedbackEmptyState>
          </slot>
          <GithubTokenRecovery
            v-if="store?.auth === 'github-token'"
            class="mxa max-w-200 border border-base border-rounded p4"
            @saved="store?.load()"
          />
        </div>
      </template>
      <template v-else-if="diff && grouped">
        <DiffsHeader
          ref="header"
          :document
          :store="store!"
          :groups-visable="groupsVisable"
          :scroll-y="scrollY"
          :hidden="headerHidden"
          :description-visible="descriptionVisible"
          :commit-nav="commitNav"
          @select-description="selectDescription"
        />

        <!-- The sidebar sits at the viewport's left edge, outside the max-width column, so it doesn't narrow the diffs on wide screens. -->
        <div ref="sidebarRow" class="flex">
          <!-- The aside stretches to the full row height so its border does too; the content inside sticks. -->
          <aside v-if="showGroupSidebar" ref="sidebar" class="relative w-64 shrink-0 border-r border-base" :style="sidebarStyle">
            <div class="sticky top-[calc(var(--diffs-header-height)+10px)] max-h-[calc(100vh-var(--diffs-header-height)-20px)] overflow-auto py-3 pl-3 pr-2">
              <DiffGroupSidebar
                :groups="groups"
                :groups-visable="groupsVisable"
                :reviewed="store!.reviewed"
                :has-description="!!diff.description?.trim()"
                :description-visible="descriptionVisible"
                @select="scrollToGroup"
                @select-description="selectDescription"
              />
            </div>
            <!-- Straddles the border, so it's as tall as the aside; a double-click resets the width. -->
            <div
              role="separator"
              aria-orientation="vertical"
              :aria-label="$t('group.resize')"
              :title="$t('group.resize')"
              class="group/resize absolute inset-y-0 right-0 w-3 flex translate-x-1/2 cursor-col-resize touch-none justify-center"
              @pointerdown="onSidebarResizeDown"
              @dblclick="groupSidebarWidth = null"
            >
              <div
                class="w-px transition-colors"
                :class="resizingSidebar ? 'bg-primary-500' : 'group-hover/resize:bg-primary-500'"
              />
            </div>
          </aside>

          <div class="mxa max-w-500 min-w-0 flex flex-auto flex-col gap-4">
            <section
              v-if="diff.description?.trim()"
              :id="descriptionId"
              :aria-labelledby="`${descriptionId}-title`"
              class="scroll-mt-[calc(var(--diffs-header-height)+10px)] border-b border-base p-4"
            >
              <h2 :id="`${descriptionId}-title`" class="mb-3 font-semibold">
                {{ $t('pr.description') }}
              </h2>
              <div
                class="overflow-hidden"
                :class="descriptionClamped && '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]'"
                :style="descriptionClamped ? { maxHeight: `${DESCRIPTION_COLLAPSED_HEIGHT}px` } : undefined"
              >
                <div ref="descriptionBody">
                  <Suspense>
                    <Markdown :value="diff.description" class="description-markdown min-w-0" />
                  </Suspense>
                </div>
              </div>
              <button
                v-if="descriptionCollapsible"
                type="button"
                class="mt-2 flex items-center gap-1 text-sm color-muted hover:color-base"
                :aria-expanded="descriptionOpen"
                @click="descriptionOpen = !descriptionOpen"
              >
                <span :class="descriptionOpen ? 'i-ph:caret-up' : 'i-ph:caret-down'" aria-hidden="true" />
                {{ descriptionOpen ? $t('pr.descriptionCollapse') : $t('pr.descriptionExpand') }}
              </button>
            </section>
            <slot name="stale" :refresh="() => store?.refresh()">
              <div v-if="isStale" class="mb-4 flex flex-wrap items-center justify-between gap-3 border border-amber:20 rounded-lg bg-amber:10 bg-raised px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <span>{{ $t('pr.newCommits') }}</span>
                <div class="flex items-center gap-3">
                  <FormCheckbox v-model="autoRefreshNextTime" :label="$t('pr.autoRefreshNextTime')" />
                  <ActionButton size="sm" @click="refreshFromBanner">
                    {{ $t('common.refresh') }}
                  </ActionButton>
                </div>
              </div>
            </slot>

            <SharedAnalysisBanner v-if="store?.shared" :store="store" />

            <ReviewSummaries v-if="store?.reviews" :summaries="store.reviews.summaries" />

            <Suspense v-if="grouped?.overallSummary">
              <Markdown :value="grouped?.overallSummary" class="border-b border-base px-4 pb-2 text-sm op-fade" />
            </Suspense>

            <DiffGroup
              v-for="group in groups"
              :key="group.key"
              :store="store!"
              :group="group"
              :collapsed="collapsedGroups.has(group.key)"
              :files-visible="filesVisible"
              @toggle="toggleGroup(group.key)"
            />

            <!-- To leave some space at the end of the diff -->
            <div class="mt-200 p2 text-center text-xs italic op50">
              {{ $t('pr.endOfDiff') }}
            </div>
          </div>
        </div>

        <ChatWidget v-if="ChatWidget && store?.llm && store.aiResult" :store="store" />
      </template>
      <template v-else>
        <div class="mxa max-w-500 w-full px-4 py-12">
          <slot name="empty" />
        </div>
      </template>
    </div>
  </div>
</template>
