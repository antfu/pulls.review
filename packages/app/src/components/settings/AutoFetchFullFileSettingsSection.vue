<script setup lang="ts">
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { autoFetchFullFile } from '../../state/auto-fetch-full-file'
</script>

<template>
  <div>
    <FormCheckbox v-model="autoFetchFullFile" :label="$t('settings.autoFetchFullFile')" />
    <p class="mt-2 text-sm color-muted">
      {{ $t('settings.autoFetchFullFileHint') }}
    </p>
  </div>
</template>
