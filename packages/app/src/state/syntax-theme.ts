import type { ThemesType } from '@pierre/diffs'
import { DEFAULT_THEMES } from '@pierre/diffs'
import { themes } from '@pierre/theming/themes'
import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

export type ColorScheme = keyof ThemesType

export interface SyntaxThemeOption {
  value: string
  label: string
  /** `pierre` (the diff library's own themes) or `shiki` (Shiki's bundled themes). */
  collection: string
}

// Words a plain title-case would get wrong in Shiki's theme ids.
const LABEL_WORDS: Record<string, string> = { github: 'GitHub' }

/** `github-dark-dimmed` -> `GitHub Dark Dimmed`. Shiki's themes carry no display name here. */
function labelFor(name: string): string {
  return name.split('-').map(word => LABEL_WORDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Every syntax theme the diff view can render, per color scheme. Read from the same
 * catalog `@pierre/diffs` resolves theme names against, so a listed theme always loads.
 */
export function syntaxThemeOptions(colorScheme: ColorScheme): SyntaxThemeOption[] {
  return themes.getThemes({ colorScheme }).map(theme => ({
    value: theme.name,
    label: theme.displayName ?? labelFor(theme.name),
    collection: theme.collection ?? '',
  }))
}

function isThemeFor(colorScheme: ColorScheme, name: unknown): name is string {
  return typeof name === 'string' && themes.getTheme(name)?.colorScheme === colorScheme
}

/**
 * The user's pick, one theme per color scheme. A shared app-wide preference, like
 * `layout.ts` - persisted the same way, under its own key.
 */
export const storedSyntaxTheme = useLocalStorage<ThemesType>('diffs:syntax-theme', DEFAULT_THEMES, { mergeDefaults: true })

/**
 * The pick as the diff view should use it: a stored name that is unknown or that belongs
 * to the other color scheme (a hand-edited value, a theme a later release dropped) falls
 * back to the default, since pierre throws on a theme it can't resolve.
 */
export const syntaxTheme = computed<ThemesType>(() => ({
  light: isThemeFor('light', storedSyntaxTheme.value.light) ? storedSyntaxTheme.value.light : DEFAULT_THEMES.light,
  dark: isThemeFor('dark', storedSyntaxTheme.value.dark) ? storedSyntaxTheme.value.dark : DEFAULT_THEMES.dark,
}))

export function setSyntaxTheme(colorScheme: ColorScheme, name: string): void {
  storedSyntaxTheme.value = { ...syntaxTheme.value, [colorScheme]: name }
}
