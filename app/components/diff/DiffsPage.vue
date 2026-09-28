<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { Markdown } from '@comark/vue'
import { Virtualizer } from '@pierre/diffs'
import { useEventListener } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { useProvider } from '../../composables/useProvider'
import { parseGithubDiffId } from '../../providers/github/diff-id'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffGroup from './DiffGroup.vue'
import DiffsHeader from './DiffsHeader.vue'
import { fileContentContextKey } from './file-content-context'

const props = defineProps<{
  document?: Document | ShadowRoot
  store?: DiffsStore
}>()

const ChatWidget = defineAsyncComponent(() => import('../chat/ChatWidget.vue'))

const diff = computed(() => props.store?.diff)
const grouped = computed(() => props.store?.grouped)
const isLoading = computed(() => props.store?.isLoading ?? false)
const error = computed(() => props.store?.error)
const isStale = computed(() => props.store?.isStale ?? false)
const groups = computed(() => props.store?.groups ?? [])

// `undefined` for any source that can't refetch a file's full content (a pasted patch
// has no live source, and no base/head refs to fetch at) - `FileDiff.vue` uses this to
// hide its "load full file" action entirely rather than show a button that would fail.
const fileContentContext = computed(() => {
  const d = diff.value
  if (!d || d.provider !== 'github' || !d.base || !d.head)
    return undefined
  if (!useProvider('github').capabilities.supportsFullFileContent)
    return undefined
  const ref = parseGithubDiffId(d.id)
  if (!ref)
    return undefined
  return { owner: ref.owner, repo: ref.repo, baseSha: d.base.sha, headSha: d.head.sha }
})
provide(fileContentContextKey, fileContentContext)

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

// top-40 (160px) approximates the sticky DiffsHeader's own height (see DiffGroup.vue's
// aside for the same constant) - a group counts as "visible" once it's scrolled past
// that, not merely past the very top of the viewport.
const HEADER_HEIGHT_PX = 160
const groupsVisable = ref<string[]>([])
function updateVisibleGroups() {
  const root = props.document ?? document
  const viewportHeight = window.innerHeight
  groupsVisable.value = groups.value
    .filter((group) => {
      const el = root.getElementById(`group-${group.key}`)
      if (!el)
        return false
      const rect = el.getBoundingClientRect()
      return rect.bottom > HEADER_HEIGHT_PX && rect.top < viewportHeight
    })
    .map(group => group.key)
}
// Groups render async (v-for over `groups`), so the first measurement has to wait for
// that DOM to actually exist - re-run whenever the group list itself changes.
watch(groups, () => nextTick(updateVisibleGroups), { immediate: true })
</script>

<template>
  <div ref="root" class="color-base bg-base">
    <div>
      <template v-if="isLoading && !diff">
        <div class="mxa px-4 py-12 max-w-500 w-full">
          <slot name="loading">
            <FeedbackLoading text="Loading…" />
          </slot>
        </div>
      </template>
      <template v-else-if="error">
        <div class="mxa px-4 py-12 max-w-500 w-full">
          <slot name="error" :error="error" :retry="() => store?.load()">
            <FeedbackEmptyState icon="i-ph:warning-duotone" title="Something went wrong">
              <template #hint>
                {{ error.message }}
              </template>
              <template #actions>
                <ActionButton variant="primary" @click="store?.load()">
                  Retry
                </ActionButton>
              </template>
            </FeedbackEmptyState>
          </slot>
        </div>
      </template>
      <template v-else-if="diff && grouped">
        <DiffsHeader
          :document
          :store="store!"
          :groups-visable="groupsVisable"
          :scroll-y="scrollY"
        />

        <div class="mxa py-4 flex flex-col gap-4 max-w-500 w-full">
          <slot name="stale" :refresh="() => store?.refresh()">
            <div v-if="isStale" class="text-sm text-amber-700 mb-4 px-3 py-2 border border-amber:20 rounded-lg bg-amber:10 bg-raised flex gap-3 items-center justify-between dark:text-amber-400">
              <span>This pull request has new commits since it was cached.</span>
              <ActionButton size="sm" @click="store?.refresh()">
                Refresh
              </ActionButton>
            </div>
          </slot>

          <Suspense v-if="grouped?.overallSummary">
            <Markdown :value="grouped?.overallSummary" class="text-sm px-4 pb-2 border-b border-base op-fade" />
          </Suspense>

          <DiffGroup
            v-for="group in groups"
            :id="`group-${group.key}`"
            :key="group.key"
            :store="store!"
            :group="group"
            :collapsed="collapsedGroups.has(group.key)"
            @toggle="toggleGroup(group.key)"
          />

          <!-- To leave some space at the end of the diff -->
          <div class="text-xs mt-200 p2 text-center op50 italic">
            You have reached the end of the diff.
          </div>
        </div>

        <ChatWidget v-if="store?.llm?.hasAiResult" :store="store" />
      </template>
      <template v-else>
        <div class="mxa px-4 py-12 max-w-500 w-full">
          <slot name="empty" />
        </div>
      </template>
    </div>
  </div>
</template>
