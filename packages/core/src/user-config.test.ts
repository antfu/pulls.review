import { describe, expect, it } from 'vitest'
import { defaultUserConfig, sanitizeUserConfig } from './user-config'

describe('sanitizeUserConfig', () => {
  it('accepts the current document and drops fields that must not sync', () => {
    const config = defaultUserConfig('de')
    config.settings.llm.provider = 'anthropic'
    config.settings.llm.anthropicApiKey = 'sk-test'
    const sanitized = sanitizeUserConfig({
      ...config,
      settings: {
        ...config.settings,
        githubToken: 'ghp_must-not-sync',
        llm: { ...config.settings.llm, unexpected: 'drop me' },
      },
      preferences: { ...config.preferences, password: 'drop me' },
    })
    expect(sanitized).toEqual(config)
    expect(JSON.stringify(sanitized)).not.toContain('must-not-sync')
    expect(JSON.stringify(sanitized)).not.toContain('drop me')
  })

  it('rejects other versions and repairs invalid provider, locale, and widths', () => {
    expect(sanitizeUserConfig({ version: 999, settings: {} })).toBeNull()
    const sanitized = sanitizeUserConfig({
      version: 1,
      settings: {
        locale: 'xx',
        llm: { provider: 'removed-provider', anthropicApiKey: 'sk-test', agent: 'unknown' },
      },
      preferences: { layout: 'sideways', chatPanelWidth: -1 },
    })
    expect(sanitized?.settings.locale).toBe('en')
    expect(sanitized?.settings.llm.provider).toBe('anthropic')
    expect(sanitized?.preferences.layout).toBe('split')
    expect(sanitized?.preferences.chatPanelWidth).toBeNull()
  })

  it('caps oversized strings by falling back', () => {
    const sanitized = sanitizeUserConfig({
      version: 1,
      settings: { locale: 'en', llm: { anthropicApiKey: 'x'.repeat(8193) } },
      preferences: {},
    })
    expect(sanitized?.settings.llm.anthropicApiKey).toBe('')
  })
})
