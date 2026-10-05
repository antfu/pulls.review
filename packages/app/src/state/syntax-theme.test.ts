import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// The singleton reads localStorage at import time, so each test re-imports a
// fresh module after seeding storage.
async function load() {
  vi.resetModules()
  return import('./syntax-theme')
}

describe('syntax theme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the pierre themes', async () => {
    const { syntaxTheme } = await load()
    expect(syntaxTheme.value).toEqual({ light: 'pierre-light', dark: 'pierre-dark' })
  })

  it('persists a pick per color scheme', async () => {
    const { setSyntaxTheme, syntaxTheme } = await load()
    setSyntaxTheme('dark', 'vitesse-dark')
    expect(syntaxTheme.value).toEqual({ light: 'pierre-light', dark: 'vitesse-dark' })
    await nextTick()
    expect(JSON.parse(localStorage.getItem('diffs:syntax-theme')!)).toEqual({ light: 'pierre-light', dark: 'vitesse-dark' })
  })

  it('reads a stored pick back', async () => {
    localStorage.setItem('diffs:syntax-theme', JSON.stringify({ light: 'github-light', dark: 'dracula' }))
    const { syntaxTheme } = await load()
    expect(syntaxTheme.value).toEqual({ light: 'github-light', dark: 'dracula' })
  })

  it('falls back on unknown or mismatched themes', async () => {
    localStorage.setItem('diffs:syntax-theme', JSON.stringify({ light: 'dracula', dark: 'not-a-theme' }))
    const { syntaxTheme } = await load()
    expect(syntaxTheme.value).toEqual({ light: 'pierre-light', dark: 'pierre-dark' })
  })

  it('lists only themes of the requested color scheme, pierre first', async () => {
    const { syntaxThemeOptions } = await load()
    const light = syntaxThemeOptions('light')
    expect(light[0]).toMatchObject({ value: 'pierre-light', label: 'Pierre Light', collection: 'pierre' })
    expect(light.map(t => t.value)).toContain('github-light')
    expect(light.map(t => t.value)).not.toContain('pierre-dark')
    expect(light.find(t => t.value === 'github-light')?.label).toBe('GitHub Light')
  })
})
