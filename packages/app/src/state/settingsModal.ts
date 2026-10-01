import { ref } from 'vue'

/**
 * Whether `SettingsModal` is open, shared across the app so anything (the
 * gear button in `NavControls`, a "Setup API Keys" prompt elsewhere) can open
 * it without owning the modal instance itself - same singleton-ref pattern as
 * `state/dark.ts`'s `isDark`.
 */
export const settingsModalOpen = ref(false)
