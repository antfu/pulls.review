<script setup lang="ts">
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupNav } from '../../state/group-nav'

const { t } = useI18n()
const options = computed(() => [
  { value: 'tabs', label: t('group.navTabs'), icon: 'i-ph:tabs-duotone' },
  { value: 'sidebar', label: t('group.navSidebar'), icon: 'i-ph:sidebar-simple-duotone' },
])
</script>

<template>
  <ActionToggleGroup
    icon-only
    :model-value="groupNav"
    :options="options"
    @update:model-value="groupNav = $event === 'sidebar' ? 'sidebar' : 'tabs'"
  />
</template>
