import { describe, expect, it } from 'vitest'
import { detectLocale, LOCALES, promptLanguageName } from './locales'

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

describe('locale message files', () => {
  const files = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json', { eager: true })

  function keysOf(messages: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(messages).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null
        ? keysOf(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`])
  }

  const englishKeys = keysOf(files['./locales/en.json']!.default).sort()

  it.each(LOCALES.map(locale => locale.code))('%s has exactly the English keys', (code) => {
    expect(keysOf(files[`./locales/${code}.json`]!.default).sort()).toEqual(englishKeys)
  })
})
