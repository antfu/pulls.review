<script setup lang="ts">
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { autoRefresh } from '../../state/auto-refresh'

// Same app-wide singleton the stale banner's "auto refresh next time" checkbox writes,
// read and written directly here like `LayoutSettingsSection` does for `layout`.
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm color-base font-medium">
      {{ $t('settings.cached') }}
    </h3>
    <FormCheckbox v-model="autoRefresh" :label="$t('settings.autoRefresh')" />
  </div>
</template>
