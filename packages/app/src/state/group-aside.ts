import { StorageSerializers, useLocalStorage } from '@vueuse/core'

/** Narrowest a group's aside goes: its own `min-w-70`. */
export const GROUP_ASIDE_MIN_WIDTH = 280
/** Widest share of the group row the aside may take, so the diffs always keep the rest. */
export const GROUP_ASIDE_MAX_RATIO = 0.5

/**
 * The width, in px, the user dragged every group's aside (title, summary, file tree)
 * to; shared, so the diff columns of all groups stay aligned. `null` keeps the default
 * 1:4 split with the diffs.
 */
export const groupAsideWidth = useLocalStorage<number | null>('diffs:group-aside-width', null, {
  serializer: StorageSerializers.number,
})
