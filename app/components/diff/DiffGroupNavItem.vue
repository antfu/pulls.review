<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed } from 'vue'
import DiffStats from './DiffStats.vue'
import { countGroupFiles, countGroupStats } from './group-utils'
import GroupCategoryIcon from './GroupCategoryIcon.vue'

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
    class="flex items-center border border-base rounded transition"
    :class="active ? 'op-100 border-primary:50 bg-primary:10 color-base' : 'op-fade hover:op-100'"
  >
    <button
      type="button"
      class="flex items-center gap-2 px-2 py-0.5 text-left text-sm hover:bg-active"
      @click="$emit('select', group.key)"
    >
      <div class="flex flex-col items-start">
        <div class="flex items-center gap-1.5">
          <GroupCategoryIcon :category="group.category" class="text-sm" />
          <span>{{ group.label }}</span>
        </div>
        <div class="flex items-center text-xs">
          <DiffStats :additions="stats.added" :deletions="stats.deleted" />
          <span class="op-mute">・{{ fileCount }} file{{ fileCount === 1 ? '' : 's' }}</span>
          <span v-if="subgroupCount" class="op-mute">・{{ subgroupCount }} subgroup{{ subgroupCount === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <DisplayDonut v-if="progress !== 0" :value="progress" :size="18" :thickness="2" />
      <ActionIconButton
        v-if="subgroupCount"
        type="button"
        :icon="expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'"
        :aria-expanded="expanded"
        class="mr--1 text-xs"
        :aria-label="expanded ? 'Hide subgroups' : 'Show subgroups'"
        @click.stop="$emit('toggle')"
      />
    </button>
  </div>
</template>
