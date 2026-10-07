<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed } from 'vue'
import { fileListLayout } from '../../state/file-list'

// Like DiffGroupNavToggle: the icon and label name the layout a click switches to.
const list = computed(() => fileListLayout.value === 'list')
</script>

<template>
  <ActionIconButton
    :icon="list ? 'i-ph:tree-view-duotone' : 'i-ph:list-bullets-duotone'"
    :label="$t(list ? 'file.layoutTree' : 'file.layoutList')"
    :tooltip="$t(list ? 'file.layoutTree' : 'file.layoutList')"
    @click="fileListLayout = list ? 'tree' : 'list'"
  />
</template>
