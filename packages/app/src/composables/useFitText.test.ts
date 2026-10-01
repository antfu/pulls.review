import { describe, expect, it } from 'vitest'
import { fitFontSize } from './useFitText'

describe('fitFontSize', () => {
  it('keeps max size when text fits', () => {
    expect(fitFontSize(100, 20, 300, 14, 20)).toBe(20)
  })

  it('grows back to max after the box widens', () => {
    expect(fitFontSize(200, 16, 400, 14, 20)).toBe(20)
  })

  it('shrinks proportionally in 0.5px steps', () => {
    expect(fitFontSize(400, 20, 330, 14, 20)).toBe(16.5)
  })

  it('stops at min so ellipsis takes over', () => {
    expect(fitFontSize(800, 20, 200, 14, 20)).toBe(14)
  })
})
