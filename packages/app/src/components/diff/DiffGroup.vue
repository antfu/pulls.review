<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { DiffsStore } from '../../stores/types'
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { Markdown } from '@comark/vue'
import { computed, nextTick, ref } from 'vue'
import { scrollToFile } from '../../composables/scrollToFile'
import { useDragResize } from '../../composables/useDragResize'
import { useFitText } from '../../composables/useFitText'
import { fileListLayout } from '../../state/file-list'
import { GROUP_ASIDE_MAX_RATIO, GROUP_ASIDE_MIN_WIDTH, groupAsideWidth } from '../../state/group-aside'
import { showGroupSidebar } from '../../state/group-nav'
import { scrollBehavior } from '../../state/smooth-scroll'
import CriticalMark from './CriticalMark.vue'
import DiffGroup from './DiffGroup.vue'
import DiffGroupNav from './DiffGroupNav.vue'
import DiffStats from './DiffStats.vue'
import FileDiff from './FileDiff.vue'
import FileTree from './FileTree.vue'
import { countGroupFiles, countGroupStats, groupIsCritical } from './group-utils'
import GroupCategoryIcon from './GroupCategoryIcon.vue'

const props = defineProps<{
  store: DiffsStore
  group: ResolvedGroupWithChildren
  collapsed: boolean
  parentLabel?: string
  parentKey?: string
  /** Shas of the files currently scrolled into view, highlighted in the tree. */
  filesVisible: string[]
}>()

const emit = defineEmits<{
  toggle: []
}>()

const totalFiles = computed(() => countGroupFiles(props.group))
const isCritical = computed(() => groupIsCritical(props.group))
const stats = computed(() => countGroupStats(props.group))
const totalAdded = computed(() => stats.value.added)
const totalDeleted = computed(() => stats.value.deleted)
const reviewedCount = computed(() => {
  const files = [...props.group.files, ...props.group.children.flatMap(child => child.files)]
  return files.filter(file => props.store.reviewed.has(file.sha)).length
})

// Each child group collapses independently of its parent and of its siblings.
const collapsedChildren = ref(new Set<string>())
function toggleChild(key: string) {
  const next = new Set(collapsedChildren.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  collapsedChildren.value = next
}

const labelBox = ref<HTMLElement>()
const labelText = ref<HTMLElement>()
const labelFontSize = useFitText(labelBox, labelText, () => props.group.label, 14, 20)

// A parent with children becomes a full-width band; its children render as ordinary
// rows at the same x-offset as top-level groups instead of being indented under it.
const isChapter = computed(() => !props.parentLabel && props.group.children.length > 0)

const childEls = new Map<string, Element>()
function setChildEl(key: string, instance: ComponentPublicInstance | null) {
  if (instance)
    childEls.set(key, instance.$el)
  else
    childEls.delete(key)
}
function scrollToChild(key: string) {
  childEls.get(key)?.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
}

function navigateToParent() {
  if (props.parentKey)
    document.getElementById(`group-${props.parentKey}`)?.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
}

const progress = computed(() => totalFiles.value === 0 ? 1 : reviewedCount.value / totalFiles.value)

// At `lg` the aside and the diffs sit in a two-column grid. Once the user drags the
// divider, the aside column takes that width - still capped, so the diffs keep the
// rest when the window narrows later; until then it's the default 1:4 split.
const rowStyle = computed(() => groupAsideWidth.value
  ? { '--group-aside-cols': `min(${groupAsideWidth.value}px, ${GROUP_ASIDE_MAX_RATIO * 100}%) minmax(0, 1fr)` }
  : undefined)

const rowEl = ref<HTMLElement>()
const asideEl = ref<HTMLElement>()
const { resizing: resizingAside, onPointerDown: onResizeDown } = useDragResize({
  target: () => asideEl.value,
  width: groupAsideWidth,
  min: GROUP_ASIDE_MIN_WIDTH,
  // Same bound as the `%` in `rowStyle`, which resolves against the row's content box.
  max: () => {
    const row = rowEl.value!
    const { paddingLeft, paddingRight } = getComputedStyle(row)
    return (row.clientWidth - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight)) * GROUP_ASIDE_MAX_RATIO
  },
})

const fileDiffRefs = new Map<string, InstanceType<typeof FileDiff>>()
function setFileDiffRef(sha: string, el: InstanceType<typeof FileDiff> | null) {
  if (el)
    fileDiffRefs.set(sha, el)
  else
    fileDiffRefs.delete(sha)
}

// Expand the target file if it's collapsed, then scroll to it once the (possibly
// newly-rendered) diff body has its real height.
function navigateToFile(sha: string) {
  fileDiffRefs.get(sha)?.expand()
  nextTick(() => {
    scrollToFile(document, sha)
  })
}
</script>

<template>
  <section :id="`group-${group.key}`" class="scroll-mt-[var(--diffs-header-height)]">
    <header v-if="isChapter" class="flex flex-col gap-2 border-b border-base p-3">
      <div class="w-full flex items-center">
        <button
          type="button"
          class="min-w-0 flex flex-1 items-start px-2 py-1 text-left"
          :aria-expanded="!collapsed"
          @click="emit('toggle')"
        >
          <ActionIconButton
            compact
            class="ml--5 py2 op-mute hover:op-100"
            :icon="collapsed ? 'i-ph:caret-right' : 'i-ph:caret-down'"
            :label="$t('group.toggle')"
            as="span"
          />
          <div class="min-w-0 flex flex-1 flex-col gap-1.5">
            <div class="flex items-center gap-2 leading-1em">
              <GroupCategoryIcon :category="group.category" class="text-xl" />
              <span class="truncate text-2xl font-medium leading-1em" :title="group.label">{{ group.label }}</span>
              <CriticalMark v-if="isCritical" class="text-xl" />
            </div>
            <div class="flex items-center gap-2 leading-1em">
              <DiffStats :additions="totalAdded" :deletions="totalDeleted" />
              <span class="text-xs op-fade">{{ $t('common.files', { n: totalFiles }, totalFiles) }}</span>
              <span class="text-xs op-fade">{{ $t('common.subgroups', { n: group.children.length }, group.children.length) }}</span>
              <DisplayDonut :value="progress" :size="12" :thickness="2.5" />
            </div>
          </div>
        </button>
        <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1 px-2">
          <slot name="actions" />
        </div>
      </div>
      <template v-if="!collapsed">
        <Suspense v-if="group.summary">
          <Markdown :value="group.summary" class="max-w-200 px-2 text-sm op-fade" />
        </Suspense>
        <!-- The sidebar already lists this subtree, so the inline sub-nav would only repeat it. -->
        <DiffGroupNav
          v-if="!showGroupSidebar"
          class="px-2"
          :groups="group.children.map(child => ({ ...child, children: [] }))"
          :groups-visable="[]"
          :reviewed="store.reviewed"
          @select="scrollToChild"
        />
      </template>
    </header>

    <div
      v-if="!isChapter || (!collapsed && group.files.length)"
      ref="rowEl"
      class="flex flex-col gap-4 p-3 lg:grid lg:grid-cols-[var(--group-aside-cols,1fr_4fr)]"
      :style="rowStyle"
    >
      <!-- --diffs-header-height is the page's real, measured sticky DiffsHeader height
           (set on the DiffsPage root), so the aside sticks just below it, not under it. -->
      <aside ref="asideEl" class="top-[calc(var(--diffs-header-height)+10px)] min-w-70 flex shrink-0 flex-col gap-3 lg:sticky lg:max-h-[calc(100vh-var(--diffs-header-height)-20px)] lg:self-start">
        <header v-if="!isChapter" class="w-full flex flex-col bg-base">
          <button
            v-if="parentLabel"
            type="button"
            class="self-start truncate pb1 pl2 text-xs leading-1em op-fade hover:op-100"
            @click="navigateToParent"
          >
            {{ parentLabel }} ›
          </button>
          <div class="w-full flex items-center">
            <button
              type="button"
              class="min-w-0 flex flex-1 items-start px-2 py-1 text-left text-sm"
              :aria-expanded="!collapsed"
              @click="emit('toggle')"
            >
              <ActionIconButton
                compact
                class="ml--5 py1.5 op-mute hover:op-100"
                :icon="collapsed ? 'i-ph:caret-right' : 'i-ph:caret-down'"
                :label="$t('group.toggle')"
                as="span"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 leading-1em">
                  <GroupCategoryIcon :category="group.category" class="text-base" />
                  <span
                    ref="labelBox"
                    class="min-w-0 flex-1 truncate text-xl font-medium"
                    :style="{ fontSize: `${labelFontSize}px` }"
                    :title="group.label"
                  >
                    <span ref="labelText">{{ group.label }}</span>
                  </span>
                  <CriticalMark v-if="isCritical" class="text-base" />
                  <div class="flex shrink-0 items-center" :title="$t('group.filesReviewed', { reviewed: reviewedCount, total: totalFiles })" />
                </div>
                <div class="flex items-center gap-2 leading-1em">
                  <DiffStats :additions="totalAdded" :deletions="totalDeleted" />
                  <span class="text-xs op-fade">{{ $t('common.files', { n: totalFiles }, totalFiles) }}</span>
                  <DisplayDonut :value="progress" :size="12" :thickness="2.5" />
                </div>
              </div>
            </button>
            <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1 px-2">
              <slot name="actions" />
            </div>
          </div>
        </header>
        <template v-if="!collapsed">
          <Suspense v-if="group.summary && !isChapter">
            <Markdown :value="group.summary" class="border-b border-base pb-2 pl2 text-sm op-fade" />
          </Suspense>
          <FileTree
            class="min-h-0 flex-1"
            :store="store"
            :files="group.files"
            :notes="group.notes"
            :missing="group.missing"
            :files-visible="filesVisible"
            :layout="fileListLayout"
            @navigate="navigateToFile"
          />
        </template>
      </aside>

      <div class="relative min-w-0 flex flex-col">
        <!-- Fills the grid gap left of the diffs, the full row height (the aside itself only
             sticks). Dragging resizes every group's aside at once; a double-click resets. -->
        <div
          v-if="!collapsed"
          role="separator"
          aria-orientation="vertical"
          :aria-label="$t('group.resize')"
          :title="$t('group.resize')"
          class="group/resize absolute inset-y-0 right-full hidden w-4 cursor-col-resize touch-none justify-center lg:flex"
          @pointerdown="onResizeDown"
          @dblclick="groupAsideWidth = null"
        >
          <div
            class="w-px transition-colors"
            :class="resizingAside ? 'bg-primary-500' : 'group-hover/resize:bg-primary-500'"
          />
        </div>
        <template v-if="!collapsed">
          <template v-for="file of group.files" :key="file.sha">
            <!-- Non-sticky anchor for scroll-spy (DiffsPage) and jump-to-file: the file header is sticky, so its own rect stays put once stuck. -->
            <div :data-file-start="file.sha" class="scroll-mt-[var(--diffs-header-height)]" />
            <FileDiff
              :ref="el => setFileDiffRef(file.sha, el as InstanceType<typeof FileDiff> | null)"
              :store="store"
              :file="file"
              :notes="group.notes.get(file.sha)"
            />
          </template>
        </template>
      </div>
    </div>

    <div v-if="isChapter && !collapsed" class="flex flex-col gap-4">
      <DiffGroup
        v-for="child in group.children"
        :key="child.key"
        :ref="el => setChildEl(child.key, el as ComponentPublicInstance | null)"
        :store="store"
        :group="{ ...child, children: [] }"
        :collapsed="collapsedChildren.has(child.key)"
        :parent-label="group.label"
        :parent-key="group.key"
        :files-visible="filesVisible"
        @toggle="toggleChild(child.key)"
      />
    </div>
  </section>
</template>
