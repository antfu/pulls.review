<script setup lang="ts">
import type { Locale } from '../../i18n/locales'
import { LOCALES } from '../../i18n/locales'
import { settings } from '../../state/settings'

// A native `<select>` rather than `FormSelect`: that one portals its list to
// `document.body`, which escapes the embed's shadow root unstyled (same reason
// `ModelPicker` is inline). Writes the app-wide singleton directly, like
// `LayoutSettingsSection` does for `layout`.
function setLocale(event: Event) {
  settings.value = { ...settings.value, locale: (event.target as HTMLSelectElement).value as Locale }
}
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm color-base font-medium">
      {{ $t('settings.language') }}
    </h3>
    <select
      :value="settings.locale"
      class="h-9 min-w-40 border border-base rounded bg-raised px-2.5 text-sm color-base outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500/40"
      @change="setLocale"
    >
      <option v-for="locale in LOCALES" :key="locale.code" :value="locale.code">
        {{ locale.native }}
      </option>
    </select>
    <p class="mt-1.5 text-xs color-faint">
      {{ $t('settings.languageHint') }}
    </p>
  </div>
</template>
