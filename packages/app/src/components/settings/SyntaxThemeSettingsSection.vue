<script setup lang="ts">
import type { ColorScheme, SyntaxThemeOption } from '../../state/syntax-theme'
import { setSyntaxTheme, syntaxTheme, syntaxThemeOptions } from '../../state/syntax-theme'

// A native `<select>` rather than `FormSelect`: dozens of themes per scheme need a
// scrollable list, and a native one needs no popper - which, like `ModelPicker`'s,
// would have to work inside the embed's shadow root. Collection names are proper
// names, so they stay untranslated.
const COLLECTION_LABELS: Record<string, string> = { pierre: 'Pierre', shiki: 'Shiki' }

function groupByCollection(options: SyntaxThemeOption[]) {
  const groups = new Map<string, SyntaxThemeOption[]>()
  for (const option of options)
    groups.set(option.collection, [...groups.get(option.collection) ?? [], option])
  return [...groups].map(([collection, options]) => ({ label: COLLECTION_LABELS[collection] ?? collection, options }))
}

const schemes = (['light', 'dark'] as const satisfies ColorScheme[]).map(scheme => ({
  scheme,
  icon: scheme === 'light' ? 'i-ph:sun-duotone' : 'i-ph:moon-duotone',
  groups: groupByCollection(syntaxThemeOptions(scheme)),
}))
</script>

<template>
  <div>
    <h3 class="mb-2 text-sm color-base font-medium">
      {{ $t('settings.syntaxTheme.label') }}
    </h3>
    <div class="grid gap-2 sm:grid-cols-2">
      <label v-for="{ scheme, icon, groups } in schemes" :key="scheme" class="flex flex-col gap-1">
        <span class="flex items-center gap-1.5 text-xs op-fade">
          <span :class="icon" aria-hidden="true" />
          {{ $t(`settings.syntaxTheme.${scheme}`) }}
        </span>
        <select
          :value="syntaxTheme[scheme]"
          class="h-9 w-full border border-base rounded bg-raised px-2 text-sm color-base outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500/40"
          @change="setSyntaxTheme(scheme, ($event.target as HTMLSelectElement).value)"
        >
          <optgroup v-for="group in groups" :key="group.label" :label="group.label">
            <option v-for="option in group.options" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </optgroup>
        </select>
      </label>
    </div>
  </div>
</template>
