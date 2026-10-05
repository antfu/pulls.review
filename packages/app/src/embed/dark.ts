import type { Ref } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { provide, ref } from 'vue'
import { isDarkKey } from '../state/dark'

/**
 * A dark-mode ref scoped to the embed's own mounted root, instead of
 * `document.documentElement` (github.com's own `<html>`, which this must never touch).
 * Toggling a class on the root still works for UnoCSS's `.dark <selector>` dark-variant
 * classes, since normal descendant combinators apply fine within a shadow tree.
 */
export function useEmbedDark(): Ref<boolean> {
  const colorMode = document.documentElement.dataset.colorMode
  const isDark = colorMode === 'auto'
    ? usePreferredDark()
    : colorMode === 'dark'
      ? ref(true)
      : ref(false)

  provide(isDarkKey, isDark)

  return isDark
}
