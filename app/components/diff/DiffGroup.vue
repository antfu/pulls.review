<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { DiffsStore } from '../../stores/types'
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { Markdown } from '@comark/vue'
import { computed, nextTick, ref } from 'vue'
import { useFitText } from '../../composables/useFitText'
import DiffGroup from './DiffGroup.vue'
import DiffGroupNav from './DiffGroupNav.vue'
import DiffStats from './DiffStats.vue'
import FileDiff from './FileDiff.vue'
import FileTree from './FileTree.vue'
import { countGroupFiles, countGroupStats } from './group-utils'
import GroupCategoryIcon from './GroupCategoryIcon.vue'

const props = defineProps<{
  store: DiffsStore
  group: ResolvedGroupWithChildren
  collapsed: boolean
  parentLabel?: string
  parentKey?: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const totalFiles = computed(() => countGroupFiles(props.group))
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
  childEls.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function navigateToParent() {
  if (props.parentKey)
    document.getElementById(`group-${props.parentKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const progress = computed(() => totalFiles.value === 0 ? 1 : reviewedCount.value / totalFiles.value)

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
    document.getElementById(`file-${sha}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        <DiffGroupNav
          class="px-2"
          :groups="group.children.map(child => ({ ...child, children: [] }))"
          :groups-visable="[]"
          :reviewed="store.reviewed"
          @select="scrollToChild"
        />
      </template>
    </header>

    <div v-if="!isChapter || (!collapsed && group.files.length)" class="flex flex-col gap-4 p-3 lg:grid lg:grid-cols-[1fr_4fr]">
      <!-- --diffs-header-height is the page's real, measured sticky DiffsHeader height
           (set on the DiffsPage root), so the aside sticks just below it, not under it. -->
      <aside class="top-[var(--diffs-header-height)] min-w-70 flex shrink-0 flex-col gap-3 lg:sticky lg:self-start">
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
            :store="store"
            :files="group.files"
            :missing="group.missing"
            @navigate="navigateToFile"
          />
        </template>
      </aside>

      <div class="min-w-0 flex flex-col gap-3">
        <template v-if="!collapsed">
          <FileDiff
            v-for="file of group.files"
            :key="file.sha"
            :ref="el => setFileDiffRef(file.sha, el as InstanceType<typeof FileDiff> | null)"
            :store="store"
            :file="file"
          />
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
        @toggle="toggleChild(child.key)"
      />
    </div>
  </section>
</template>
