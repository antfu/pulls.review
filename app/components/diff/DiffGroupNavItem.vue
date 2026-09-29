<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed } from 'vue'
import DiffStats from './DiffStats.vue'
import { countGroupFiles, countGroupStats } from './group-utils'

const props = defineProps<{
  group: ResolvedGroupWithChildren
  active: boolean
  reviewed: Set<string>
  expanded?: boolean
}>()

defineEmits<{
  select: [key: string]
  toggle: []
}>()

const stats = computed(() => countGroupStats(props.group))
const fileCount = computed(() => countGroupFiles(props.group))
const subgroupCount = computed(() => props.group.children.length)
const progress = computed(() => {
  const files = [...props.group.files, ...props.group.children.flatMap(child => child.files)]
  if (files.length === 0)
    return 1
  return files.filter(file => props.reviewed.has(file.sha)).length / files.length
})
</script>

<template>
  <div
    class="border border-base rounded flex transition items-center"
    :class="active ? 'op-100 border-primary:50 bg-primary:10 color-base' : 'op-fade hover:op-100'"
  >
    <button
      type="button"
      class="text-sm px-2 py-0.5 text-left flex gap-2 items-center hover:bg-active"
      @click="$emit('select', group.key)"
    >
      <div class="flex flex-col items-start">
        <div>{{ group.label }}</div>
        <div class="text-xs flex items-center">
          <DiffStats :additions="stats.added" :deletions="stats.deleted" />
          <span class="op-mute">・{{ fileCount }} file{{ fileCount === 1 ? '' : 's' }}</span>
          <span v-if="subgroupCount" class="op-mute">・{{ subgroupCount }} subgroup{{ subgroupCount === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <DisplayDonut v-if="progress !== 0" :value="progress" :size="18" :thickness="2" />
    </button>
    <button
      v-if="subgroupCount"
      type="button"
      class="px-1.5 border-l border-base op-mute flex items-center self-stretch hover:bg-active hover:op-100"
      :aria-expanded="expanded"
      :aria-label="expanded ? 'Hide subgroups' : 'Show subgroups'"
      @click="$emit('toggle')"
    >
      <span :class="expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'" aria-hidden="true" />
    </button>
  </div>
</template>
