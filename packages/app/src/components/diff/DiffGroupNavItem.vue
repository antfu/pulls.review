<script setup lang="ts">
import type { ResolvedGroupWithChildren } from './group-utils'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import { computed } from 'vue'
import { CATEGORY_COLOR_CLASS } from './category-icons'
import DiffStats from './DiffStats.vue'
import { countGroupFiles, countGroupStats, groupProgress } from './group-utils'
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
const progress = computed(() => groupProgress(props.group, props.reviewed))
</script>

<template>
  <div
    class="flex items-center border border-b-2 border-base rounded-t transition-all"
    :class="[
      CATEGORY_COLOR_CLASS[group.category],
      active ? 'border-b-current shadow translate-y--1px' : '',
    ]"
  >
    <button
      type="button"
      :class="[
        active ? 'op-100' : 'op-fade hover:op-100',
      ]"
      class="group flex items-center gap-2 px-2 py-0.5 text-left text-sm color-base hover:bg-active"
      @click="$emit('select', group.key)"
    >
      <div class="flex flex-col items-start">
        <div class="flex items-center gap-1.5">
          <GroupCategoryIcon
            :category="group.category"
            class="text-sm group-hover:saturate-100"
            :class="active ? '' : 'saturate-0'"
          />
          <span>{{ group.label }}</span>
        </div>
        <div class="flex items-center text-xs">
          <DiffStats :additions="stats.added" :deletions="stats.deleted" />
          <span class="op-mute">・{{ $t('common.files', { n: fileCount }, fileCount) }}</span>
          <span v-if="subgroupCount" class="op-mute">・{{ $t('common.subgroups', { n: subgroupCount }, subgroupCount) }}</span>
        </div>
      </div>
      <DisplayDonut v-if="progress !== 0" :value="progress" :size="18" :thickness="2" />
      <ActionIconButton
        v-if="subgroupCount"
        type="button"
        :icon="expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'"
        :aria-expanded="expanded"
        class="mr--1 text-xs"
        :aria-label="$t(expanded ? 'group.hideSubgroups' : 'group.showSubgroups')"
        @click.stop="$emit('toggle')"
      />
    </button>
  </div>
</template>
