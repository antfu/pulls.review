import { afterEach, describe, expect, it, vi } from 'vitest'
import { smoothScroll } from '../state/smooth-scroll'
import { scrollToFile } from './scrollToFile'

function mountMarker() {
  const marker = document.createElement('div')
  marker.dataset.fileStart = 'abc'
  // Far below its scroll-margin, so a jump is needed.
  marker.getBoundingClientRect = () => ({ top: 500 }) as DOMRect
  marker.scrollIntoView = vi.fn()
  document.body.append(marker)
  return marker
}

describe('scrollToFile', () => {
  afterEach(() => {
    smoothScroll.value = true
    document.body.innerHTML = ''
  })

  it('animates the jump by default', () => {
    const marker = mountMarker()
    scrollToFile(document, 'abc')
    expect(marker.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('jumps right away with smooth scrolling turned off', () => {
    smoothScroll.value = false
    const marker = mountMarker()
    scrollToFile(document, 'abc')
    expect(marker.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  })
})
