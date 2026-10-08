<script setup lang="ts">
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { smoothScroll } from '../../state/smooth-scroll'

// An app-wide singleton, read and written directly here like `LayoutSettingsSection` does for `layout`.
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm color-base font-medium">
      {{ $t('settings.navigation') }}
    </h3>
    <FormCheckbox v-model="smoothScroll" :label="$t('settings.smoothScroll')" />
  </div>
</template>
