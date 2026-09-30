import type { Locale } from './locales'
import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { settings } from '../state/settings'
import en from './locales/en.json'

export type MessageSchema = typeof en

declare module 'vue-i18n' {
  /** Types every `t()`/`$t()` key against the English messages. */
  export interface DefineLocaleMessage extends MessageSchema {}
}

// Russian has three plural forms (1 / 2-4 / 5+, with the teens as 5+); the default
// two-form rule can't express it.
function russianPlural(choice: number, choicesLength: number): number {
  if (choice === 0)
    return 0
  const teen = choice > 10 && choice < 20
  const endsWithOne = choice % 10 === 1
  if (choicesLength < 4)
    return !teen && endsWithOne ? 1 : 2
  if (!teen && endsWithOne)
    return 1
  if (!teen && choice % 10 >= 2 && choice % 10 <= 4)
    return 2
  return 3
}

/**
 * One app-wide instance: English is bundled, every other locale is fetched on first use
 * (`import.meta.glob` keeps each file its own chunk). Also read outside components -
 * the rule-based adapter and the agent's progress messages call `i18n.global.t`.
 */
export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  // vue-i18n types `messages` as complete for every locale; the others arrive via
  // `setLocaleMessage` in `loadLocale` below.
  messages: { en } as Record<Locale, MessageSchema>,
  pluralizationRules: { ru: russianPlural },
})

const loaders = import.meta.glob<{ default: MessageSchema }>('./locales/*.json')

export async function loadLocale(locale: Locale): Promise<void> {
  if (!i18n.global.availableLocales.includes(locale)) {
    const messages = await loaders[`./locales/${locale}.json`]!()
    i18n.global.setLocaleMessage(locale, messages.default)
  }
  i18n.global.locale.value = locale
  // The embed shares github.com's document; its `lang` is not ours to set.
  if (!import.meta.env.PR_EMBED)
    document.documentElement.lang = locale
}

watch(() => settings.value.locale, locale => void loadLocale(locale), { immediate: true })

export const t = i18n.global.t
