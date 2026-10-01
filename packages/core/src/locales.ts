/**
 * The languages the UI and the LLM's summaries can be in. `name` is the English name
 * the analysis prompt uses (the prompt itself stays English), `native` is what the
 * language picker and the shared-analysis banner show.
 */
export const LOCALES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh-CN', name: 'Simplified Chinese', native: '简体中文' },
  { code: 'zh-TW', name: 'Traditional Chinese', native: '繁體中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt-BR', name: 'Brazilian Portuguese', native: 'Português (Brasil)' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
] as const

export type Locale = typeof LOCALES[number]['code']

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some(locale => locale.code === value)
}

/** Traditional-script Chinese regions map onto the one Traditional variant offered. */
const REGION_ALIASES: Record<string, Locale> = {
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
}

/**
 * Picks the first supported locale the browser prefers: an exact tag match first
 * (`zh-TW`), then the bare language (`pt-PT` -> `pt-BR`, `zh` -> `zh-CN`).
 */
export function detectLocale(preferred: readonly string[] = navigator.languages): Locale {
  for (const tag of preferred) {
    const lower = tag.toLowerCase()
    const exact = LOCALES.find(locale => locale.code.toLowerCase() === lower)
    if (exact)
      return exact.code
    const alias = REGION_ALIASES[lower]
    if (alias)
      return alias
    const language = lower.split('-')[0]!
    const byLanguage = LOCALES.find(locale => locale.code.toLowerCase().split('-')[0] === language)
    if (byLanguage)
      return byLanguage.code
  }
  return DEFAULT_LOCALE
}

/** How the language picker and the shared-analysis banner label a locale; unknown tags (a newer client's) show as-is. */
export function nativeLocaleName(code: string): string {
  return LOCALES.find(locale => locale.code === code)?.native ?? code
}

/** How the English prompt names the language to answer in, e.g. `Simplified Chinese (简体中文)`. */
export function promptLanguageName(code: Locale): string {
  const locale = LOCALES.find(entry => entry.code === code)!
  return locale.name === locale.native ? locale.name : `${locale.name} (${locale.native})`
}
