import type { InjectionKey, Ref } from 'vue'
import { useDark } from '@vueuse/core'

export const isDark = useDark()

/**
 * Lets a subtree override the ambient dark-mode ref that pierre-diffs theming reads
 * (see `FileDiff.vue`), without touching `document.documentElement` - the GitHub-embed
 * custom element provides its own scoped ref here instead, since `isDark` above targets
 * the host page's `<html>`, which the embed must never touch.
 */
export const isDarkKey: InjectionKey<Ref<boolean>> = Symbol('diffs-is-dark')
