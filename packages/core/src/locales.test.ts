import { describe, expect, it } from 'vitest'
import { detectLocale, promptLanguageName } from './locales'

describe('detectLocale', () => {
  it('matches an exact tag before falling back to the language', () => {
    expect(detectLocale(['zh-TW', 'en'])).toBe('zh-TW')
    expect(detectLocale(['pt-PT'])).toBe('pt-BR')
    expect(detectLocale(['zh'])).toBe('zh-CN')
    expect(detectLocale(['zh-HK'])).toBe('zh-TW')
  })

  it('skips unsupported languages and defaults to English', () => {
    expect(detectLocale(['xx-YY', 'ja'])).toBe('ja')
    expect(detectLocale(['xx-YY'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })
})

describe('promptLanguageName', () => {
  it('names English once and other languages in both scripts', () => {
    expect(promptLanguageName('en')).toBe('English')
    expect(promptLanguageName('zh-CN')).toBe('Simplified Chinese (简体中文)')
  })
})
