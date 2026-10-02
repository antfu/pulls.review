<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { Markdown } from '@comark/vue'
import { Virtualizer } from '@pierre/diffs'
import { useElementBounding, useEventListener } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { autoRefresh } from '../../state/auto-refresh'
import GithubTokenRecovery from '../settings/GithubTokenRecovery.vue'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffGroup from './DiffGroup.vue'
import DiffsHeader from './DiffsHeader.vue'
import ReviewSummaries from './ReviewSummaries.vue'
import SharedAnalysisBanner from './SharedAnalysisBanner.vue'

const props = defineProps<{
  document?: Document | ShadowRoot
  store?: DiffsStore
}>()

// Compile-time: with LLM support off `store.llm` is never set, so the widget is dead code.
const ChatWidget = import.meta.env.PR_LLM
  ? defineAsyncComponent(() => import('../chat/ChatWidget.vue'))
  : undefined

const diff = computed(() => props.store?.diff)
const grouped = computed(() => props.store?.grouped)
const isLoading = computed(() => props.store?.isLoading ?? false)
const error = computed(() => props.store?.error)
// Only GitHub sources have a review lifecycle, so `reviews` doubles as "this is a
// GitHub PR" - the one case where a missing/expired token can cause a load error and
// offering the token field as a recovery affordance makes sense (a paste can't).
const isGithub = computed(() => !!props.store?.reviews)
const isStale = computed(() => props.store?.isStale ?? false)
const groups = computed(() => props.store?.groups ?? [])

// Inside the embed this component's own root is the `overflow-auto` scroller (see
// `EmbedApp.ce.vue`); on the site the window scrolls. In element mode the virtualizer
// watches `root.firstElementChild` for scroll-height changes, hence the single inner
// wrapper. `FileDiff`s mount first and connect early; the virtualizer queues them until `setup()`.
const virtualizer = new Virtualizer()
provide(diffVirtualizerKey, virtualizer)
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
useEventListener(() => props.document ?? document, 'scroll', (event) => {
  scrollY.value = event.target instanceof Element ? event.target.scrollTop : window.scrollY
  updateVisibleGroups()
}, { capture: true })

// The sticky DiffsHeader's height drives every sticky offset below it: its real,
// measured height is published as the `--diffs-header-height` CSS variable on the root
// (DiffGroup asides and section scroll-margins read it) and reused here so a group only
// counts as "visible" once it's scrolled past the header, not merely past the viewport top.
const headerRef = useTemplateRef<{ $el: HTMLElement }>('header')
const { height: headerHeight } = useElementBounding(() => headerRef.value?.$el)
const groupsVisable = ref<string[]>([])
function updateVisibleGroups() {
  const root = props.document ?? document
  const viewportHeight = window.innerHeight
  const keys = groups.value.flatMap(group => [group.key, ...group.children.map(child => child.key)])
  groupsVisable.value = keys.filter((key) => {
    const el = root.getElementById(`group-${key}`)
    if (!el)
      return false
    const rect = el.getBoundingClientRect()
    return rect.bottom > headerHeight.value && rect.top < viewportHeight
  })
}
// Groups render async (v-for over `groups`), so the first measurement has to wait for
// that DOM to actually exist - re-run whenever the group list or header height changes.
watch([groups, headerHeight], () => nextTick(updateVisibleGroups), { immediate: true })

const styles = computed(() => {
  return {
    '--diffs-header-height': headerHeight.value ? `${headerHeight.value}px` : undefined,
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
            v-if="isGithub"
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
        />

        <div class="mxa max-w-500 w-full flex flex-col gap-4">
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
            @toggle="toggleGroup(group.key)"
          />

          <!-- To leave some space at the end of the diff -->
          <div class="mt-200 p2 text-center text-xs italic op50">
            {{ $t('pr.endOfDiff') }}
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
