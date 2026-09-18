<script setup lang="ts">
import type { ModelOption } from '../../analyze/adapters/llm/list-models'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

// Inline expandable picker (no floating popper: the embed build runs in a
// Shadow DOM where teleported poppers escape the shadow root unstyled).
// Collapsed it's a single trigger row; expanded it grows in-flow into a
// searchable list with per-model pricing where the provider exposes it.
const props = defineProps<{
  /** Catalog for the active provider; `null` while unavailable. */
  models: ModelOption[] | null
  loading?: boolean
  /** Catalog fetch failed - fall back to free-text model id entry. */
  error?: string
}>()

const modelId = defineModel<string>({ required: true })

const open = ref(false)
const query = ref('')
const listEl = useTemplateRef<HTMLDivElement>('listEl')

watch(open, async (isOpen) => {
  query.value = ''
  if (isOpen) {
    // The list expands in-flow near the bottom of a scrollable modal body -
    // bring it into view so opening the picker actually reveals options.
    await nextTick()
    listEl.value?.scrollIntoView({ block: 'nearest' })
  }
})

const current = computed(() => props.models?.find(m => m.id === modelId.value))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = props.models ?? []
  if (!q)
    return all
  return all.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

/** A non-empty query that isn't an existing id can be used as a custom model id. */
const customCandidate = computed(() => {
  const q = query.value.trim()
  if (!q || props.models?.some(m => m.id === q))
    return undefined
  return q
})

function pick(id: string) {
  modelId.value = id
  open.value = false
}

// Per-token pricing is USD per 1M tokens. Whole dollars render bare ($3),
// sub-dollar rates keep two decimals ($0.15).
function fmtRate(value: number): string {
  return `$${value >= 1 && Number.isInteger(value) ? value : value.toFixed(2)}`
}

function priceLabel(model: ModelOption): string | undefined {
  if (!model.pricing)
    return undefined
  if (model.pricing.input === 0 && model.pricing.output === 0)
    return 'Free'
  return `${fmtRate(model.pricing.input)} / ${fmtRate(model.pricing.output)}`
}

function priceTitle(model: ModelOption): string | undefined {
  if (!model.pricing)
    return undefined
  return `Input ${fmtRate(model.pricing.input)}/M · Output ${fmtRate(model.pricing.output)}/M tokens`
}
</script>

<template>
  <FormTextInput
    v-if="error"
    v-model="modelId"
    placeholder="model id"
  />

  <div v-else class="border border-base rounded bg-raised flex flex-col">
    <button
      type="button"
      class="text-sm px-2.5 outline-none inline-flex gap-2 h-9 transition items-center justify-between focus-visible:ring-2 focus-visible:ring-primary-500/40"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span v-if="loading" class="op-fade flex gap-2 items-center">
        <span class="i-ph:circle-notch animate-spin" aria-hidden="true" />
        Loading models…
      </span>
      <span v-else class="color-base flex gap-2 min-w-0 items-center">
        <span class="truncate">{{ current?.name ?? modelId }}</span>
        <span v-if="current && priceLabel(current)" class="text-xs op-mute shrink-0 tabular-nums" :title="priceTitle(current)">
          {{ priceLabel(current) }}
        </span>
      </span>
      <span :class="open ? 'i-ph:caret-up' : 'i-ph:caret-down'" class="op-fade shrink-0" aria-hidden="true" />
    </button>

    <div v-if="open" ref="listEl" class="border-t border-base flex flex-col">
      <div class="p-1.5">
        <FormTextInput
          v-model="query"
          size="sm"
          icon="i-ph:magnifying-glass"
          placeholder="Search models…"
          clearable
          class="w-full"
        />
      </div>
      <div class="pb-1 max-h-56 of-y-auto" role="listbox">
        <div v-if="loading" class="text-sm px-3 py-4 text-center op-mute">
          Loading models…
        </div>
        <div v-else-if="!filtered.length && !customCandidate" class="text-sm px-3 py-4 text-center op-mute">
          No matching model
        </div>
        <button
          v-for="model in filtered"
          :key="model.id"
          type="button"
          role="option"
          :aria-selected="model.id === modelId"
          class="text-sm px-3 py-1.5 text-left outline-none flex gap-2 w-full transition items-center focus-visible:bg-hover"
          :class="model.id === modelId ? 'color-active bg-active' : 'op-fade hover:op100 hover:bg-hover'"
          @click="pick(model.id)"
        >
          <span class="flex-1 min-w-0 truncate">{{ model.name }}</span>
          <span
            v-if="priceLabel(model)"
            class="text-xs shrink-0 tabular-nums"
            :class="priceLabel(model) === 'Free' ? 'color-active' : 'op-mute'"
            :title="priceTitle(model)"
          >{{ priceLabel(model) }}</span>
          <span v-if="model.id === modelId" class="i-ph:check text-xs shrink-0" aria-hidden="true" />
        </button>
        <button
          v-if="customCandidate"
          type="button"
          class="text-sm px-3 py-1.5 text-left outline-none op-fade flex gap-2 w-full transition items-center focus-visible:bg-hover hover:bg-hover hover:op100"
          @click="pick(customCandidate)"
        >
          <span class="i-ph:plus text-xs shrink-0" aria-hidden="true" />
          <span class="flex-1 min-w-0 truncate">Use “{{ customCandidate }}”</span>
        </button>
      </div>
    </div>
  </div>
</template>
