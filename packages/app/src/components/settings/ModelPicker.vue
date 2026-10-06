<script setup lang="ts">
import type { ModelOption } from '@pulls.review/core/llm'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// A trigger row that floats a searchable list with per-model pricing where the
// provider exposes it. The list portals into this component rather than
// `document.body`: the embed runs in a Shadow DOM a body teleport would escape
// unstyled, and in the Settings modal a body-level popper would stack behind it.
const props = defineProps<{
  /** Catalog for the active provider; `null` while unavailable. */
  models: ModelOption[] | null
  loading?: boolean
  /** Catalog fetch failed - fall back to free-text model id entry. */
  error?: string
}>()

const modelId = defineModel<string>({ required: true })
const { t } = useI18n()

const open = ref(false)
const query = ref('')
const host = useTemplateRef<HTMLDivElement>('host')

watch(open, () => query.value = '')

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
    return t('settings.models.free')
  return `${fmtRate(model.pricing.input)} / ${fmtRate(model.pricing.output)}`
}

function priceTitle(model: ModelOption): string | undefined {
  if (!model.pricing)
    return undefined
  return t('settings.models.priceTitle', { input: fmtRate(model.pricing.input), output: fmtRate(model.pricing.output) })
}
</script>

<template>
  <FormTextInput
    v-if="error"
    v-model="modelId"
    :placeholder="$t('settings.models.placeholder')"
  />

  <div v-else ref="host" class="relative">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger
        class="h-9 w-full inline-flex items-center justify-between gap-2 border border-base rounded bg-raised px-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span v-if="loading" class="flex items-center gap-2 op-fade">
          <span class="i-ph:circle-notch animate-spin" aria-hidden="true" />
          {{ $t('settings.models.loading') }}
        </span>
        <span v-else class="min-w-0 flex items-center gap-2 color-base">
          <span class="truncate">{{ current?.name ?? modelId }}</span>
          <span v-if="current && priceLabel(current)" class="shrink-0 text-xs tabular-nums op-mute" :title="priceTitle(current)">
            {{ priceLabel(current) }}
          </span>
        </span>
        <span :class="open ? 'i-ph:caret-up' : 'i-ph:caret-down'" class="shrink-0 op-fade" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverPortal :to="host ?? undefined">
        <PopoverContent
          align="start"
          :side-offset="6"
          class="z-dropdown w-[--reka-popover-trigger-width] flex flex-col overflow-hidden border border-base rounded-lg bg-glass:75 shadow-lg outline-none"
        >
          <div class="p-1.5">
            <FormTextInput
              v-model="query"
              size="sm"
              icon="i-ph:magnifying-glass"
              :placeholder="$t('settings.models.search')"
              clearable
              class="w-full"
            />
          </div>
          <div class="max-h-56 of-y-auto pb-1" role="listbox">
            <div v-if="loading" class="px-3 py-4 text-center text-sm op-mute">
              {{ $t('settings.models.loading') }}
            </div>
            <div v-else-if="!filtered.length && !customCandidate" class="px-3 py-4 text-center text-sm op-mute">
              {{ $t('settings.models.noMatch') }}
            </div>
            <button
              v-for="model in filtered"
              :key="model.id"
              type="button"
              role="option"
              :aria-selected="model.id === modelId"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm outline-none transition focus-visible:bg-hover"
              :class="model.id === modelId ? 'color-active bg-active' : 'op-fade hover:op100 hover:bg-hover'"
              @click="pick(model.id)"
            >
              <span class="min-w-0 flex-1 truncate">{{ model.name }}</span>
              <span
                v-if="priceLabel(model)"
                class="shrink-0 text-xs tabular-nums"
                :class="model.pricing?.input === 0 && model.pricing.output === 0 ? 'color-active' : 'op-mute'"
                :title="priceTitle(model)"
              >{{ priceLabel(model) }}</span>
              <span v-if="model.id === modelId" class="i-ph:check shrink-0 text-xs" aria-hidden="true" />
            </button>
            <button
              v-if="customCandidate"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm op-fade outline-none transition focus-visible:bg-hover hover:bg-hover hover:op100"
              @click="pick(customCandidate)"
            >
              <span class="i-ph:plus shrink-0 text-xs" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ $t('settings.models.useCustom', { id: customCandidate }) }}</span>
            </button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
