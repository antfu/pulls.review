<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed } from 'vue'
import { groupNav } from '../../state/group-nav'

// Like DarkToggle: the icon and label name the mode a click switches to.
const sidebar = computed(() => groupNav.value === 'sidebar')
</script>

<template>
  <ActionIconButton
    :icon="sidebar ? 'i-ph:tabs-duotone' : 'i-ph:sidebar-simple-duotone'"
    :label="$t(sidebar ? 'group.navTabs' : 'group.navSidebar')"
    :tooltip="$t(sidebar ? 'group.navTabs' : 'group.navSidebar')"
    @click="groupNav = sidebar ? 'tabs' : 'sidebar'"
  />
</template>
