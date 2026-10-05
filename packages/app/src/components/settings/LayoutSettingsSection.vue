<script setup lang="ts">
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { layout } from '../../state/layout'
import { wrapLines } from '../../state/wrap-lines'

// Same singleton `DiffsHeader.vue`'s layout toggle used to write through
// `store.ui.setLayout` - a shared app-wide preference, so this section reads
// and writes it directly, like `DarkToggle.vue` does for `isDark`.
const { t } = useI18n()
const layoutOptions = computed(() => [
  { value: 'unified', label: t('settings.unified'), icon: 'i-ph:rows-duotone' },
  { value: 'split', label: t('settings.split'), icon: 'i-ph:columns-duotone' },
])
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm color-base font-medium">
      {{ $t('settings.layout') }}
    </h3>
    <ActionToggleGroup
      :model-value="layout"
      :options="layoutOptions"
      @update:model-value="layout = ($event as 'split' | 'unified')"
    />
    <div class="mt-3">
      <FormCheckbox v-model="wrapLines" :label="$t('settings.wrapLines')" />
    </div>
  </div>
</template>
