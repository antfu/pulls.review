import type { LlmSettings } from '@pulls.review/core/analyze'
import type { Locale } from '@pulls.review/core/locales'
import { defaultLlmSettings, deriveProvider } from '@pulls.review/core/analyze'
import { detectLocale, isLocale } from '@pulls.review/core/locales'
import { useLocalStorage } from '@vueuse/core'

export interface Settings {
  githubToken: string
  /** By GitLab host, so a token is only ever sent to the instance it was saved for. */
  gitlabTokens: Record<string, string>
  llm: LlmSettings
  /** UI language and the language the LLM writes summaries in; seeded from the browser's preference. */
  locale: Locale
}

const defaultSettings: Settings = {
  githubToken: '',
  gitlabTokens: {},
  llm: defaultLlmSettings,
  locale: detectLocale(),
}

/**
 * Every setting lives under one localStorage key - needs synchronous access before a
 * provider call, so localStorage over unstorage/IndexedDB. A plain module-level
 * singleton (like `state/dark.ts`'s `isDark`) - every caller shares the same value.
 */
export const settings = useLocalStorage<Settings>('diffs:settings', defaultSettings, {
  mergeDefaults: (storage, defaults) => {
    const llm: LlmSettings = { ...defaults.llm, ...storage?.llm }
    // Settings stored before `provider` existed picked a provider by key priority;
    // seed the explicit selection the same way so existing setups keep working.
    if (!storage?.llm?.provider)
      llm.provider = deriveProvider(llm)
    // A locale this build no longer ships (or none stored yet) falls back to the browser's.
    const locale = isLocale(storage?.locale) ? storage.locale : defaults.locale
    return { ...defaults, ...storage, llm, locale }
  },
})
