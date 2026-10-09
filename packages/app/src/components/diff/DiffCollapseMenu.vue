<script setup lang="ts">
import type { FileChange } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import OverlayDropdownItem from '@antfu/design/components/Overlay/OverlayDropdownItem.vue'
import { DropdownMenuContent, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, inject, ref, useTemplateRef } from 'vue'
import { fileCollapseKey } from './file-collapse'
import { reviewStatus } from './review-status'

const props = defineProps<{
  store: DiffsStore
}>()

const collapseState = inject(fileCollapseKey)!

// Keep the menu in the themed shadow tree, but constrain it to its scroll container.
const open = ref(false)
const root = useTemplateRef<HTMLDivElement>('root')
const collisionBoundary = computed(() => {
  const boundaries: Element[] = []
  for (let parent = root.value?.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent)
    if (/auto|scroll|hidden|clip/.test(`${overflowX} ${overflowY}`))
      boundaries.push(parent)
  }
  return boundaries
})

const actions = [
  { label: 'file.expandAll', icon: 'i-ph:arrows-out-line-vertical-duotone', collapse: false, applies: () => true },
  { label: 'file.collapseAll', icon: 'i-ph:arrows-in-line-vertical-duotone', collapse: true, applies: () => true },
  { label: 'file.collapseReviewed', icon: 'i-ph:check-square-duotone', collapse: true, applies: (file: FileChange) => reviewStatus(props.store, file) === 'reviewed' },
] as const

function run(action: typeof actions[number]) {
  for (const file of props.store.diff?.files ?? []) {
    if (action.applies(file))
      collapseState.set(file.sha, action.collapse)
  }
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative">
    <DropdownMenuRoot v-model:open="open" :modal="false">
      <DropdownMenuTrigger as-child>
        <ActionIconButton
          icon="i-ph:caret-up-down-duotone"
          :label="$t('file.collapseMenu')"
          :tooltip="$t('file.collapseMenu')"
          :active="open"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        :collision-boundary="collisionBoundary"
        :collision-padding="8"
        class="z-dropdown min-w-48 flex flex-col overflow-auto border border-base rounded-lg bg-base p-1 shadow-lg outline-none"
        :style="{ maxWidth: 'var(--reka-dropdown-menu-content-available-width)', maxHeight: 'var(--reka-dropdown-menu-content-available-height)' }"
      >
        <OverlayDropdownItem
          v-for="action in actions"
          :key="action.label"
          :icon="action.icon"
          @select="run(action)"
        >
          {{ $t(action.label) }}
        </OverlayDropdownItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  </div>
</template>
