<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { Markdown } from '@comark/vue'
import { computed, nextTick, ref } from 'vue'
import { useFitText } from '../../composables/useFitText'
import DiffGroup from './DiffGroup.vue'
import DiffStats from './DiffStats.vue'
import FileDiff from './FileDiff.vue'
import FileTree from './FileTree.vue'

const props = defineProps<{
  store: DiffsStore
  group: ResolvedGroupWithChildren
  collapsed: boolean
  /** Nested (child) groups render without their own sticky header or further children. */
  nested?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const totalFiles = computed(() => props.group.files.length + props.group.children.reduce((n, c) => n + c.files.length, 0))
const totalAdded = computed(() => props.group.added + props.group.children.reduce((n, c) => n + c.added, 0))
const totalDeleted = computed(() => props.group.deleted + props.group.children.reduce((n, c) => n + c.deleted, 0))
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
  <section class="scroll-mt-45">
    <div class="p-3 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_4fr]">
      <!-- top-40 approximates the page's own sticky DiffsHeader height, so the aside
           sticks just below it rather than underneath it. -->
      <aside class="flex shrink-0 flex-col gap-3 min-w-70 top-40 lg:self-start lg:sticky">
        <header class="bg-base flex w-full items-center">
          <button
            type="button"
            class="text-sm px-2 py-1 text-left flex flex-1 min-w-0 items-start"
            :aria-expanded="!collapsed"
            @click="emit('toggle')"
          >
            <ActionIconButton
              compact
              class="ml--5 py1.5 op-mute hover:op-100"
              :icon="collapsed ? 'i-ph:caret-right' : 'i-ph:caret-down'"
              label="Toggle group"
              as="span"
            />
            <div class="flex-1 min-w-0">
              <div class="leading-1em flex gap-2 items-center">
                <span
                  ref="labelBox"
                  class="text-xl font-medium flex-1 min-w-0 truncate"
                  :style="{ fontSize: `${labelFontSize}px` }"
                  :title="group.label"
                >
                  <span ref="labelText">{{ group.label }}</span>
                </span>
                <div class="flex shrink-0 items-center" :title="`${reviewedCount} / ${totalFiles} files reviewed`" />
              </div>
              <div class="leading-1em flex gap-2 items-center">
                <DiffStats :additions="totalAdded" :deletions="totalDeleted" />
                <span class="text-xs op-fade">{{ totalFiles }} file{{ totalFiles === 1 ? '' : 's' }}</span>
                <DisplayDonut :value="progress" :size="12" :thickness="2.5" />
              </div>
            </div>
          </button>
          <div v-if="$slots.actions" class="px-2 flex shrink-0 gap-1 items-center">
            <slot name="actions" />
          </div>
        </header>
        <template v-if="!collapsed">
          <Suspense v-if="group.summary">
            <Markdown :value="group.summary" class="text-sm pb-2 border-b border-base op-fade" />
          </Suspense>
          <FileTree
            :store="store"
            :files="group.files"
            @navigate="navigateToFile"
          />
        </template>
      </aside>

      <div class="flex flex-col gap-3 min-w-0">
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

    <div v-if="!collapsed && !nested && group.children.length" class="ml-3 pl-4 border-l border-base flex flex-col gap-4">
      <DiffGroup
        v-for="child in group.children"
        :key="child.key"
        :store="store"
        :group="{ ...child, children: [] }"
        :collapsed="collapsedChildren.has(child.key)"
        nested
        @toggle="toggleChild(child.key)"
      />
    </div>
  </section>
</template>
