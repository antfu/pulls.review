import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function load() {
  vi.resetModules()
  return (await import('./wrap-lines')).wrapLines
}

describe('diff line wrapping', () => {
  beforeEach(() => localStorage.clear())

  it('is enabled when no preference is stored', async () => {
    expect((await load()).value).toBe(true)
  })

  it('keeps wrapping disabled after a reload', async () => {
    const wrapLines = await load()
    wrapLines.value = false
    await nextTick()
    expect(localStorage.getItem('diffs:wrap-lines')).toBe('false')
    expect((await load()).value).toBe(false)
  })

  it('can enable wrapping again', async () => {
    localStorage.setItem('diffs:wrap-lines', 'false')
    const wrapLines = await load()
    wrapLines.value = true
    await nextTick()
    expect((await load()).value).toBe(true)
  })
})
