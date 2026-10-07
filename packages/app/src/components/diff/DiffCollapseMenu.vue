<script setup lang="ts">
import type { FileChange } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { onClickOutside } from '@vueuse/core'
import { inject, ref, useTemplateRef } from 'vue'
import { fileCollapseKey } from './file-collapse'
import { reviewStatus } from './review-status'

const props = defineProps<{
  store: DiffsStore
}>()

const collapseState = inject(fileCollapseKey)!

// In-flow rather than portalled, for the same shadow-root reason as `LanguageMenu`.
const open = ref(false)
const root = useTemplateRef<HTMLDivElement>('root')
onClickOutside(root, () => open.value = false)

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
    <ActionIconButton
      icon="i-ph:caret-up-down-duotone"
      :label="$t('file.collapseMenu')"
      :tooltip="$t('file.collapseMenu')"
      :active="open"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    />
    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-dropdown mt-1 min-w-48 flex flex-col overflow-hidden border border-base rounded-lg bg-base p-1 shadow-lg"
    >
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        role="menuitem"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm color-base outline-none transition focus-visible:bg-hover hover:bg-hover"
        @click="run(action)"
      >
        <span :class="action.icon" class="shrink-0 op-fade" aria-hidden="true" />
        <span class="min-w-0 flex-1 whitespace-nowrap">{{ $t(action.label) }}</span>
      </button>
    </div>
  </div>
</template>
