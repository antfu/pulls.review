<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed, ref } from 'vue'
import CriticalMark from './CriticalMark.vue'
import DiffStats from './DiffStats.vue'
import { countGroupFiles, countGroupStats, groupIsCritical, groupProgress } from './group-utils'
import GroupCategoryIcon from './GroupCategoryIcon.vue'

const props = defineProps<{
  groups: ResolvedGroupWithChildren[]
  groupsVisable: string[]
  reviewed: Set<string>
}>()

defineEmits<{
  select: [key: string]
}>()

const collapsed = ref(new Set<string>())
function toggleCollapsed(key: string) {
  const next = new Set(collapsed.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  collapsed.value = next
}

// The tree flattened to rows; a collapsed parent simply contributes no child rows.
// Subgroups get a leaf `children` array so the shared stats helpers apply to them too.
const rows = computed(() => props.groups.flatMap(group => [
  { group, depth: 0 },
  ...(collapsed.value.has(group.key)
    ? []
    : group.children.map(child => ({ group: { ...child, children: [] }, depth: 1 }))),
]))
</script>

<template>
  <nav class="flex flex-col gap-0.5 text-sm">
    <div
      v-for="{ group, depth } in rows"
      :key="group.key"
      class="group flex items-center rounded pr-1 transition-colors"
      :class="[
        groupsVisable.includes(group.key) ? 'bg-active' : 'hover:bg-hover',
        depth ? 'pl-4 border-base rounded-l-none' : 'mt-1',
      ]"
    >
      <button
        type="button"
        class="min-w-0 flex flex-1 flex-col items-start px-2 py-1 text-left color-base"
        :class="groupsVisable.includes(group.key) ? 'op-100' : 'op-fade hover:op-100'"
        @click="$emit('select', group.key)"
      >
        <span class="w-full flex items-center gap-1.5">
          <GroupCategoryIcon
            :category="group.category"
            class="text-sm group-hover:saturate-100"
            :class="groupsVisable.includes(group.key) ? '' : 'saturate-0'"
          />
          <span class="truncate" :title="group.label">{{ group.label }}</span>
          <CriticalMark v-if="groupIsCritical(group)" class="text-sm" />
        </span>
        <span class="ml-6 flex items-center gap-1 text-xs">
          <DiffStats :additions="countGroupStats(group).added" :deletions="countGroupStats(group).deleted" />
          <span class="op-mute">・{{ $t('common.files', { n: countGroupFiles(group) }, countGroupFiles(group)) }}</span>
        </span>
      </button>
      <DisplayDonut
        v-if="groupProgress(group, reviewed)"
        :value="groupProgress(group, reviewed)"
        :size="16"
        :thickness="2"
        class="shrink-0"
      />
      <ActionIconButton
        v-if="group.children.length"
        :icon="collapsed.has(group.key) ? 'i-ph:caret-right' : 'i-ph:caret-down'"
        :aria-expanded="!collapsed.has(group.key)"
        :label="$t(collapsed.has(group.key) ? 'group.showSubgroups' : 'group.hideSubgroups')"
        class="shrink-0 text-xs"
        @click="toggleCollapsed(group.key)"
      />
    </div>
  </nav>
</template>
