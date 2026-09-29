<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import DiffStats from './DiffStats.vue'
import { countGroupFiles, countGroupStats } from './group-utils'

const props = defineProps<{
  groups: ResolvedGroupWithChildren[]
  groupsVisable: string[]
  reviewed: Set<string>
}>()

defineEmits<{
  select: [key: string]
}>()

function groupProgress(group: ResolvedGroupWithChildren) {
  const files = [...group.files, ...group.children.flatMap(child => child.files)]
  if (files.length === 0)
    return 1
  return files.filter(file => props.reviewed.has(file.sha)).length / files.length
}
</script>

<template>
  <div
    class="text-sm flex flex-1 flex-wrap gap-1.5 min-w-0 items-center relative"
  >
    <button
      v-for="group in groups"
      :key="group.key"
      type="button"
      class="px-2 py-0.5 border border-base rounded flex gap-2 transition items-center hover:bg-active hover:op-100"
      :class="groupsVisable.includes(group.key) ? 'op-100 border-primary:50 bg-primary:10 color-base' : 'op-fade'"
      @click="$emit('select', group.key)"
    >
      <div class="flex flex-col items-start">
        <div>{{ group.label }}</div>
        <div class="text-xs flex items-center">
          <DiffStats :additions="countGroupStats(group).added" :deletions="countGroupStats(group).deleted" />
          <span class="op-mute">・{{ countGroupFiles(group) }} files</span>
        </div>
      </div>
      <DisplayDonut v-if="groupProgress(group) !== 0" :value="groupProgress(group)" :size="18" :thickness="2" />
    </button>
  </div>
</template>
