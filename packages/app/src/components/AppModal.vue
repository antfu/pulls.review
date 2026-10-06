<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

// A minimal in-house replacement for `@antfu/design`'s `OverlayModal`: that one's
// `reka-ui` `DialogPortal` always teleports to `document.body`, which - inside the
// GitHub-embed custom element - escapes the shadow root entirely and renders
// unstyled directly on the host page. `document` (the embed's own shadow root, see
// `EmbedApp.ce.vue`) lets this Teleport stay inside it instead; the main site (no
// `document` prop) keeps teleporting to the real `document.body` as before.
const props = defineProps<{
  open: boolean
  title?: string
  description?: string
  document?: Document | ShadowRoot
  padding?: 'none' | 'small' | 'medium' | 'large'
  bodyClass?: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

// A `ShadowRoot` isn't a valid CSS selector, so Teleport's `to` (typed as
// `string | HTMLElement` but happy with any target used directly) needs the
// object itself, not a stringified target - the real `document` also isn't a
// selector, so that case falls back to `'body'`.
const teleportTarget = computed(() => props.document instanceof ShadowRoot ? props.document : 'body')

function close() {
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    close()
}

watch(() => props.open, (isOpen) => {
  if (isOpen)
    document.addEventListener('keydown', onKeydown)
  else
    document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const paddingClass = computed(() => {
  return props.padding === 'large'
    ? 'p-6'
    : props.padding === 'medium'
      ? 'p-4'
      : props.padding === 'small'
        ? 'p-3'
        : props.padding === 'none'
          ? ''
          : 'p-2'
})
</script>

<template>
  <Teleport :to="teleportTarget">
    <div v-if="open" class="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div class="fixed inset-0 z-modal-backdrop bg-[#ddd]/40 backdrop-blur-sm dark:bg-black/40" @click="close" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="relative z-modal-content max-h-full max-w-3xl w-full flex flex-col overflow-hidden border border-base rounded-lg bg-base shadow-xl outline-none"
      >
        <header
          v-if="title || description || $slots.header" class="flex shrink-0 items-center justify-between gap-2 border-b border-base px-4 py-2"
        >
          <div class="min-w-0">
            <h2 v-if="title" class="color-base font-medium">
              {{ title }}
            </h2>
            <p v-if="description" class="text-sm op-fade">
              {{ description }}
            </p>
            <slot name="header" />
          </div>
          <button type="button" class="btn-icon h-7 w-7 shrink-0" :aria-label="$t('common.close')" @click="close">
            <span class="i-ph:x" aria-hidden="true" />
          </button>
        </header>
        <div
          class="flex-1 overflow-auto"
          :class="[paddingClass, bodyClass]"
        >
          <slot />
        </div>
        <footer v-if="$slots.footer" class="flex shrink-0 justify-end gap-2 border-t border-base px-2 py-2">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
