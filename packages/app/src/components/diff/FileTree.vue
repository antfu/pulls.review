<script setup lang="ts">
import type { FileChange } from '@pulls.review/core/types'
import type { FileListLayout } from '../../state/file-list'
import type { DiffsStore } from '../../stores/types'
import type { ResolvedNote } from './group-utils'
import DisplayFileIcon from '@antfu/design/components/Display/DisplayFileIcon.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, useTemplateRef } from 'vue'
import CriticalMark from './CriticalMark.vue'
import DiffStats from './DiffStats.vue'
import { fileRows } from './file-rows'
import FileStatus from './FileStatus.vue'
import { fileIsCritical } from './group-utils'
import { reviewStatus } from './review-status'
import ReviewCheckbox from './ReviewCheckbox.vue'

const props = defineProps<{
  store: DiffsStore
  files: FileChange[]
  /** Analysis notes by file sha, for the critical marker. */
  notes?: Map<string, ResolvedNote[]>
  /** Paths the analysis named that have since left the diff, shown as removed. */
  missing?: string[]
  /** Shas of the files currently scrolled into view. */
  filesVisible: string[]
  layout: FileListLayout
}>()

const emit = defineEmits<{
  navigate: [sha: string]
}>()

const rows = computed(() => fileRows(props.files, props.missing ?? [], props.layout))

function folderStatus(files: FileChange[]): 'reviewed' | 'partial' | 'unreviewed' {
  const reviewedCount = files.filter(file => props.store.reviewed.has(file.sha)).length
  if (reviewedCount === 0)
    return 'unreviewed'
  return reviewedCount === files.length ? 'reviewed' : 'partial'
}

const scrollElRef = useTemplateRef<HTMLDivElement>('scrollEl')

const virtualizer = useVirtualizer(computed(() => ({
  count: rows.value.length,
  getScrollElement: () => scrollElRef.value,
  estimateSize: () => 24,
  overscan: 10,
})))
</script>

<template>
  <div ref="scrollEl" class="overflow-auto">
    <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
      <div
        v-for="row in virtualizer.getVirtualItems().map(item => ({ item, row: rows[item.index]! }))"
        :key="row.row.key"
        class="flex items-center gap-1.5 rounded text-sm"
        :class="row.row.file && filesVisible.includes(row.row.file.sha) ? 'bg-active' : ''"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${row.item.size}px`,
          transform: `translateY(${row.item.start}px)`,
          paddingLeft: `${0.5 + row.row.depth}em`,
        }"
      >
        <template v-if="row.row.type === 'folder'">
          <ReviewCheckbox
            :status="folderStatus(row.row.files!)"
            :aria-label="$t('file.markFolderReviewed', { name: row.row.name })"
            @update="store.setReviewed(row.row.files!.map(file => file.sha), $event)"
          />
          <DisplayFileIcon directory :path="row.row.name" class="op-fade" />
          <span class="truncate op-fade">{{ row.row.name }}</span>
        </template>
        <template v-else-if="row.row.file">
          <ReviewCheckbox
            :status="reviewStatus(store, row.row.file)"
            :aria-label="$t('file.markReviewed')"
            @update="store.setReviewed([row.row.file.sha], $event)"
          />
          <button
            type="button"
            class="min-w-0 flex flex-1 items-center gap-1.5 text-left"
            :title="reviewStatus(store, row.row.file) === 'changed' ? $t('file.changedSinceReviewed') : undefined"
            @click="emit('navigate', row.row.file.sha)"
          >
            <DisplayFilePath :path="row.row.name" :dim="layout === 'list'" class="min-w-0 flex-1" />
            <CriticalMark v-if="fileIsCritical(notes?.get(row.row.file.sha))" class="text-sm" />
            <DiffStats :additions="row.row.file.additions" :deletions="row.row.file.deletions" />
            <FileStatus :status="row.row.file.status" />
          </button>
        </template>
        <template v-else-if="row.row.type === 'missing'">
          <span class="w-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex flex-1 items-center gap-1.5 op-50" :title="$t('file.noLongerInDiff')">
            <DisplayFilePath :path="row.row.name" :dim="layout === 'list'" class="min-w-0 flex-1 line-through" />
            <span class="shrink-0 text-xs">{{ $t('file.removed') }}</span>
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
