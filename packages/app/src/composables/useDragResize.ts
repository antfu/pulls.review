import type { Ref } from 'vue'
import { ref } from 'vue'

export interface DragResizeOptions {
  /** The element being resized; a drag starts from its rendered width. */
  target: () => HTMLElement | null | undefined
  /** Where the dragged width goes; `null` until the first drag. */
  width: Ref<number | null>
  min: number
  /** Read once, when a drag starts. */
  max: () => number
  /** The target's edge the handle sits on; dragging away from the target widens it. */
  edge?: 'left' | 'right'
}

/**
 * Drag-to-resize through a handle on the target's `edge` (right by default): bind
 * `onPointerDown` to the handle. `resizing` stays true for the length of a drag.
 */
export function useDragResize({ target, width, min, max, edge = 'right' }: DragResizeOptions) {
  const direction = edge === 'right' ? 1 : -1
  const resizing = ref(false)
  let startX = 0
  let startWidth = 0
  let maxWidth = 0

  function onPointerMove(event: PointerEvent) {
    width.value = Math.round(Math.min(Math.max(startWidth + (event.clientX - startX) * direction, min), maxWidth))
  }
  function onPointerUp(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', onPointerUp)
    resizing.value = false
  }
  function onPointerDown(event: PointerEvent) {
    event.preventDefault()
    startX = event.clientX
    // The rendered width, not the stored one: nothing is stored before the first drag,
    // and a since-narrowed window may cap what is.
    startWidth = target()!.getBoundingClientRect().width
    maxWidth = max()
    resizing.value = true
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
  }

  return { resizing, onPointerDown }
}
