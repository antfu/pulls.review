<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import { computed, ref } from 'vue'
import DiffGroupNavItem from './DiffGroupNavItem.vue'

const props = defineProps<{
  groups: ResolvedGroupWithChildren[]
  groupsVisable: string[]
  reviewed: Set<string>
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const expandedKey = ref<string>()
function toggleExpanded(key: string, expand = expandedKey.value !== key) {
  expandedKey.value = expand ? key : undefined
}

// Subgroups are rendered as their own nav items (no further nesting), so give each a
// leaf `children` array to satisfy the item component's stats helpers.
const subgroups = computed<ResolvedGroupWithChildren[]>(() => {
  const group = props.groups.find(g => g.key === expandedKey.value)
  return group ? group.children.map(child => ({ ...child, children: [] })) : []
})

function onSelectSubgroup(key: string) {
  emit('select', key)
  toggleExpanded(key, true)
}
</script>

<template>
  <div class="min-w-0 flex flex-1 flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <DiffGroupNavItem
        v-for="group in groups"
        :key="group.key"
        :group="group"
        :active="groupsVisable.includes(group.key)"
        :reviewed="reviewed"
        :expanded="expandedKey === group.key"
        @select="onSelectSubgroup($event)"
        @toggle="toggleExpanded(group.key)"
      />
      <slot />
    </div>
    <template v-if="subgroups.length">
      <div class="flex items-center gap-1">
        <div class="i-ph-folder-notch-open-duotone op-fade" />
        <div class="text-sm">
          <span class="op-fade">{{ $t('group.subgroupsOf') }} </span> <span>{{ props.groups.find(g => g.key === expandedKey)?.label }}</span>
        </div>
        <div class="flex-auto border-t border-base" />
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <DiffGroupNavItem
          v-for="sub in subgroups"
          :key="sub.key"
          :group="sub"
          :active="groupsVisable.includes(sub.key)"
          :reviewed="reviewed"
          @select="$emit('select', $event)"
        />
      </div>
    </template>
  </div>
</template>
