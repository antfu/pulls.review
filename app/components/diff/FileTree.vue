<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import type { FileChange } from '../../types/diff'
import DisplayFileIcon from '@antfu/design/components/Display/DisplayFileIcon.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { computed, useTemplateRef } from 'vue'
import DiffStats from './DiffStats.vue'
import FileStatus from './FileStatus.vue'

const props = defineProps<{
  store: DiffsStore
  files: FileChange[]
  /** Paths the analysis named that have since left the diff, shown as removed. */
  missing?: string[]
}>()

const emit = defineEmits<{
  navigate: [sha: string]
}>()

interface TreeRow {
  key: string
  depth: number
  type: 'folder' | 'file' | 'missing'
  name: string
  file?: FileChange
  /** Folder rows only: every file nested under it, for the folder-level checkbox. */
  files?: FileChange[]
}

const rows = computed<TreeRow[]>(() => {
  interface Node { name: string, children: Map<string, Node>, file?: FileChange, missing?: boolean }
  const root: Node = { name: '', children: new Map() }

  const leaves = [
    ...props.files.map(file => ({ path: file.path, file })),
    ...(props.missing ?? []).map(path => ({ path, file: undefined })),
  ].sort((a, b) => a.path.localeCompare(b.path))

  for (const { path, file } of leaves) {
    const segments = path.split('/')
    let node = root
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!
      let child = node.children.get(segment)
      if (!child) {
        child = { name: segment, children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
    node.children.set(`\0file:${path}`, { name: segments[segments.length - 1]!, children: new Map(), file, missing: !file })
  }

  function collectFiles(node: Node): FileChange[] {
    const result: FileChange[] = []
    for (const child of node.children.values())
      result.push(...(child.file ? [child.file] : collectFiles(child)))
    return result
  }

  const result: TreeRow[] = []
  function walk(node: Node, depth: number, pathPrefix: string) {
    for (const [key, child] of node.children) {
      if (child.file) {
        result.push({ key: `file:${child.file.path}`, depth, type: 'file', name: child.name, file: child.file })
        continue
      }
      if (child.missing) {
        result.push({ key: `missing:${pathPrefix}${child.name}`, depth, type: 'missing', name: child.name })
        continue
      }

      // Collapse a chain of single-child folders into one row, e.g.
      // `src` -> `components` -> (diff, bar) renders as a single `src/components` row.
      let name = child.name
      let tail = child
      let prefix = `${pathPrefix}${key}/`
      while (tail.children.size === 1) {
        const [onlyKey, onlyChild] = [...tail.children.entries()][0]!
        if (onlyChild.file || onlyChild.missing)
          break
        name += `/${onlyChild.name}`
        tail = onlyChild
        prefix += `${onlyKey}/`
      }
      result.push({ key: `folder:${prefix}`, depth, type: 'folder', name, files: collectFiles(tail) })
      walk(tail, depth + 1, prefix)
    }
  }
  walk(root, 0, '')
  return result
})

function folderState(files: FileChange[]): boolean | 'indeterminate' {
  const reviewedCount = files.filter(file => props.store.reviewed.has(file.sha)).length
  if (reviewedCount === 0)
    return false
  return reviewedCount === files.length ? true : 'indeterminate'
}

// One `toggleReviewed` call per file, same as clicking each checkbox individually -
// there's no batched API on the store, so a very large folder toggles as N writes.
function toggleFolder(files: FileChange[], reviewed: boolean) {
  for (const file of files)
    props.store.toggleReviewed(file.sha, reviewed)
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
        class="flex items-center gap-1.5 text-sm"
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
          <CheckboxRoot
            class="h-4 w-4 flex shrink-0 items-center justify-center border border-base rounded bg-raised outline-none transition data-[state=checked]:border-primary-500 data-[state=indeterminate]:border-primary-500 data-[state=checked]:bg-primary-500 data-[state=indeterminate]:bg-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :model-value="folderState(row.row.files!)"
            :aria-label="$t('file.markFolderReviewed', { name: row.row.name })"
            @update:model-value="value => toggleFolder(row.row.files!, value === true)"
          >
            <CheckboxIndicator class="text-white">
              <div :class="folderState(row.row.files!) === 'indeterminate' ? 'i-ph:minus-bold' : 'i-ph:check-bold'" class="mt--1px text-micro" aria-hidden="true" />
            </CheckboxIndicator>
          </CheckboxRoot>
          <DisplayFileIcon directory :path="row.row.name" class="op-fade" />
          <span class="truncate op-fade">{{ row.row.name }}</span>
        </template>
        <template v-else-if="row.row.file">
          <FormCheckbox
            :model-value="store.reviewed.has(row.row.file.sha)"
            @update:model-value="store.toggleReviewed(row.row.file.sha, $event)"
          />
          <button
            type="button"
            class="min-w-0 flex flex-1 items-center gap-1.5 text-left"
            @click="emit('navigate', row.row.file.sha)"
          >
            <DisplayFilePath :path="row.row.name" :dim="false" class="min-w-0 flex-1" />
            <DiffStats :additions="row.row.file.additions" :deletions="row.row.file.deletions" />
            <FileStatus :status="row.row.file.status" />
          </button>
        </template>
        <template v-else-if="row.row.type === 'missing'">
          <span class="w-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex flex-1 items-center gap-1.5 op-50" :title="$t('file.noLongerInDiff')">
            <DisplayFilePath :path="row.row.name" :dim="false" class="min-w-0 flex-1 line-through" />
            <span class="shrink-0 text-xs">{{ $t('file.removed') }}</span>
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
