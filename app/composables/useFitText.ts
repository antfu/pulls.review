import type { Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

export function fitFontSize(textWidth: number, currentSize: number, boxWidth: number, min: number, max: number): number {
  if (textWidth <= 0 || boxWidth <= 0)
    return max
  const fitted = Math.floor(boxWidth / (textWidth / currentSize) * 2) / 2
  return Math.min(max, Math.max(min, fitted))
}

export function useFitText(box: Ref<HTMLElement | undefined>, text: Ref<HTMLElement | undefined>, source: () => string, min: number, max: number) {
  const fontSize = ref(max)

  function fit() {
    if (!box.value || !text.value)
      return
    const current = Number.parseFloat(getComputedStyle(box.value).fontSize)
    fontSize.value = fitFontSize(text.value.getBoundingClientRect().width, current, box.value.clientWidth, min, max)
  }

  useResizeObserver(box, fit)
  watch(source, () => nextTick(fit))
  document.fonts?.ready.then(fit)

  return fontSize
}
