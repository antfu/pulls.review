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
</script>

<template>
  <Teleport :to="teleportTarget">
    <div v-if="open" class="p-4 flex items-center inset-0 justify-center fixed z-modal">
      <div class="bg-[#ddd]/40 inset-0 fixed z-modal-backdrop backdrop-blur-sm dark:bg-black/40" @click="close" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="outline-none border border-base rounded-lg bg-base flex flex-col max-h-full max-w-lg w-full shadow-xl relative z-modal-content overflow-hidden"
      >
        <header v-if="title || description || $slots.header" class="px-3 py-2 border-b border-base flex shrink-0 gap-2 items-start justify-between">
          <div class="min-w-0">
            <h2 v-if="title" class="color-base font-medium">
              {{ title }}
            </h2>
            <p v-if="description" class="text-sm op-fade">
              {{ description }}
            </p>
            <slot name="header" />
          </div>
          <button type="button" class="btn-icon shrink-0 h-7 w-7" aria-label="Close" @click="close">
            <span class="i-ph:x" aria-hidden="true" />
          </button>
        </header>
        <div class="p-3 flex-1 overflow-auto">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="px-2 py-2 border-t border-base flex shrink-0 gap-2 justify-end">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
