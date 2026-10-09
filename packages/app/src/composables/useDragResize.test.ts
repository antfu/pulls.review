import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useDragResize } from './useDragResize'

function setup(renderedWidth: number, edge?: 'left' | 'right') {
  const target = document.createElement('div')
  target.getBoundingClientRect = () => ({ width: renderedWidth }) as DOMRect
  const handle = document.createElement('div')
  handle.setPointerCapture = () => {}
  const width = ref<number | null>(null)
  const { resizing, onPointerDown } = useDragResize({ target: () => target, width, min: 200, max: () => 600, edge })
  handle.addEventListener('pointerdown', event => onPointerDown(event as PointerEvent))
  const fire = (type: string, clientX: number) => handle.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 1 }))
  return { width, resizing, fire }
}

describe('useDragResize', () => {
  it('starts from the rendered width and follows the pointer', () => {
    const { width, resizing, fire } = setup(300)
    fire('pointerdown', 100)
    expect(resizing.value).toBe(true)
    fire('pointermove', 150.4)
    expect(width.value).toBe(350)
    fire('pointerup', 150)
    expect(resizing.value).toBe(false)
  })

  it('widens toward the left from a left-edge handle', () => {
    const { width, fire } = setup(300, 'left')
    fire('pointerdown', 100)
    fire('pointermove', 60)
    expect(width.value).toBe(340)
    fire('pointermove', 130)
    expect(width.value).toBe(270)
  })

  it('clamps to min and max', () => {
    const { width, fire } = setup(300)
    fire('pointerdown', 100)
    fire('pointermove', -1000)
    expect(width.value).toBe(200)
    fire('pointermove', 1000)
    expect(width.value).toBe(600)
  })

  it('stops following the pointer once released', () => {
    const { width, fire } = setup(300)
    fire('pointerdown', 100)
    fire('pointermove', 120)
    fire('pointerup', 120)
    fire('pointermove', 400)
    expect(width.value).toBe(320)
  })
})
