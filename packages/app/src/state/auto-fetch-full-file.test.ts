import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function load() {
  vi.resetModules()
  return (await import('./auto-fetch-full-file')).autoFetchFullFile
}

describe('automatic full-file fetching', () => {
  beforeEach(() => localStorage.clear())

  it('is disabled by default', async () => {
    expect((await load()).value).toBe(false)
  })

  it('keeps the disabled preference after a reload', async () => {
    localStorage.setItem('diffs:auto-fetch-full-file', 'true')
    const preference = await load()
    preference.value = false
    await nextTick()
    expect((await load()).value).toBe(false)
  })

  it('can enable fetching again', async () => {
    localStorage.setItem('diffs:auto-fetch-full-file', 'false')
    const preference = await load()
    preference.value = true
    await nextTick()
    expect((await load()).value).toBe(true)
  })
})
