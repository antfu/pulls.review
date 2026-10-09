import { StorageSerializers, useLocalStorage } from '@vueuse/core'

/** Narrowest page the chat docks beside the diffs in; below it the chat floats over them. */
export const CHAT_PANEL_DOCK_MIN_WIDTH = 1024
/** Narrowest the docked chat panel goes. */
export const CHAT_PANEL_MIN_WIDTH = 320
/** Widest share of the page the docked chat panel may take. */
export const CHAT_PANEL_MAX_RATIO = 0.6

/** The width, in px, the user dragged the docked chat panel to; `null` keeps the default `w-120`. */
export const chatPanelWidth = useLocalStorage<number | null>('diffs:chat-panel-width', null, {
  serializer: StorageSerializers.number,
})
