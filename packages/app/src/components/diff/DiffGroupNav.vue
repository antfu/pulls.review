<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import { computed, ref } from 'vue'
import DiffGroupNavItem from './DiffGroupNavItem.vue'

const props = defineProps<{
  groups: ResolvedGroupWithChildren[]
  groupsVisable: string[]
  reviewed: Set<string>
  hasDescription?: boolean
  descriptionVisible?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  selectDescription: []
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
      <button
        v-if="hasDescription"
        type="button"
        class="flex items-center self-stretch gap-1.5 border border-b-2 border-base rounded-t px-2 py-0.5 text-sm transition-all hover:bg-active"
        :class="descriptionVisible ? 'border-b-current shadow translate-y--1px' : 'op-fade hover:op-100'"
        :aria-current="descriptionVisible ? 'location' : undefined"
        @click="emit('selectDescription')"
      >
        <span class="i-ph:text-align-left" aria-hidden="true" />
        {{ $t('pr.description') }}
      </button>
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
