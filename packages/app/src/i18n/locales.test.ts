import { LOCALES } from '@pulls.review/core/locales'
import { describe, expect, it } from 'vitest'

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
