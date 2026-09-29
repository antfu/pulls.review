<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import { computed, ref } from 'vue'
import DiffGroupNavItem from './DiffGroupNavItem.vue'

const props = defineProps<{
  groups: ResolvedGroupWithChildren[]
  groupsVisable: string[]
  reviewed: Set<string>
}>()

defineEmits<{
  select: [key: string]
}>()

const expandedKey = ref<string>()
function toggleExpanded(key: string) {
  expandedKey.value = expandedKey.value === key ? undefined : key
}

// Subgroups are rendered as their own nav items (no further nesting), so give each a
// leaf `children` array to satisfy the item component's stats helpers.
const subgroups = computed<ResolvedGroupWithChildren[]>(() => {
  const group = props.groups.find(g => g.key === expandedKey.value)
  return group ? group.children.map(child => ({ ...child, children: [] })) : []
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-1.5 min-w-0">
    <div class="flex flex-wrap gap-1.5 items-center">
      <DiffGroupNavItem
        v-for="group in groups"
        :key="group.key"
        :group="group"
        :active="groupsVisable.includes(group.key)"
        :reviewed="reviewed"
        :expanded="expandedKey === group.key"
        @select="$emit('select', $event)"
        @toggle="toggleExpanded(group.key)"
      />
    </div>
    <div v-if="subgroups.length" class="pl-3 flex flex-wrap gap-1.5 items-center">
      <DiffGroupNavItem
        v-for="sub in subgroups"
        :key="sub.key"
        :group="sub"
        :active="groupsVisable.includes(sub.key)"
        :reviewed="reviewed"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>
