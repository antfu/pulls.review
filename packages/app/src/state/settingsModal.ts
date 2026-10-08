import { ref } from 'vue'

export const SETTINGS_TABS = ['appearance', 'behavior', 'github', 'gitlab', 'ai'] as const
export type SettingsTab = typeof SETTINGS_TABS[number]

/**
 * Whether `SettingsModal` is open and which tab it shows, shared across the app so
 * anything (the gear button in `NavControls`, a "Setup API Keys" prompt elsewhere) can
 * open it on the right tab without owning the modal instance itself - same
 * singleton-ref pattern as `state/dark.ts`'s `isDark`.
 */
export const settingsModalOpen = ref(false)
export const settingsModalTab = ref<SettingsTab>('appearance')

/** Opens Settings, on `tab` when given, else on whichever tab it last showed. */
export function openSettings(tab?: SettingsTab): void {
  if (tab)
    settingsModalTab.value = tab
  settingsModalOpen.value = true
}
