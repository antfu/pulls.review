import type { LlmSettings } from '@pulls.review/core/analyze'
import type { Locale } from '@pulls.review/core/locales'
import { defaultLlmSettings, deriveProvider, isLlmProvider } from '@pulls.review/core/analyze'
import { detectLocale, isLocale } from '@pulls.review/core/locales'
import { useLocalStorage } from '@vueuse/core'

export interface Settings {
  llm: LlmSettings
  /** UI language and the language the LLM writes summaries in; seeded from the browser's preference. */
  locale: Locale
}

const defaultSettings: Settings = {
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
    // seed the explicit selection the same way so existing setups keep working. The
    // same applies to a stored provider this build no longer ships.
    if (!storage?.llm?.provider || !isLlmProvider(storage.llm.provider))
      llm.provider = deriveProvider(llm)
    // A locale this build no longer ships (or none stored yet) falls back to the browser's.
    const locale = isLocale(storage?.locale) ? storage.locale : defaults.locale
    return { llm, locale }
  },
})

// Older builds accepted a pasted GitHub PAT and cached its hashed metadata.
// Remove both on first load so a now-unsupported credential does not remain
// in browser storage after the settings schema drops it.
try {
  if (localStorage.getItem('diffs:settings')?.includes('"githubToken"'))
    localStorage.setItem('diffs:settings', JSON.stringify(settings.value))
  localStorage.removeItem('diffs:github-token-meta')
}
catch {}
