<!-- A free-text git ref field that suggests the repo's branches and tags but accepts any revision (`HEAD~2`, a sha). -->
<script setup lang="ts">
import { usePortalTarget } from '@antfu/design/composables/portalTarget'
import { AutocompleteAnchor, AutocompleteContent, AutocompleteInput, AutocompleteItem, AutocompletePortal, AutocompleteRoot, AutocompleteViewport } from 'reka-ui'

export interface RefSuggestion {
  name: string
  kind: 'branch' | 'tag'
}

// The root renders no element of its own: route `class` etc. to the field.
defineOptions({ inheritAttrs: false })

defineProps<{
  suggestions: RefSuggestion[]
  placeholder?: string
  icon?: string
}>()

const model = defineModel<string>({ default: '' })

const portalTo = usePortalTarget(() => undefined)
const ICONS: Record<RefSuggestion['kind'], string> = {
  branch: 'i-ph:git-branch-duotone',
  tag: 'i-ph:tag-duotone',
}
</script>

<template>
  <AutocompleteRoot v-model="model" open-on-focus open-on-click>
    <AutocompleteAnchor
      v-bind="$attrs"
      class="h-9 min-w-0 inline-flex items-center gap-2 border border-base rounded bg-raised px-2 text-sm transition focus-within:ring-2 focus-within:ring-primary-500/40"
    >
      <span v-if="icon" :class="icon" class="shrink-0 op-fade" aria-hidden="true" />
      <AutocompleteInput
        :placeholder="placeholder"
        :aria-label="placeholder"
        class="min-w-0 flex-1 bg-transparent color-base font-mono outline-none placeholder:op-mute"
      />
    </AutocompleteAnchor>
    <AutocompletePortal :to="portalTo">
      <AutocompleteContent
        position="popper"
        :side-offset="6"
        class="z-dropdown max-h-72 min-w-[--reka-combobox-trigger-width] overflow-auto border border-base rounded-lg bg-glass:75 p-1 shadow-lg"
        data-af-animate
      >
        <AutocompleteViewport>
          <AutocompleteItem
            v-for="suggestion in suggestions"
            :key="`${suggestion.kind}:${suggestion.name}`"
            :value="suggestion.name"
            class="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm color-base font-mono outline-none transition data-[highlighted]:bg-hover"
          >
            <span :class="ICONS[suggestion.kind]" class="shrink-0 op-fade" aria-hidden="true" />
            <span class="truncate">{{ suggestion.name }}</span>
          </AutocompleteItem>
        </AutocompleteViewport>
      </AutocompleteContent>
    </AutocompletePortal>
  </AutocompleteRoot>
</template>
