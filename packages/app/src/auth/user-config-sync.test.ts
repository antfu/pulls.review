import { defaultUserConfig } from '@pulls.review/core/user-config'
import { describe, expect, it } from 'vitest'
import { layout } from '../state/layout'
import { settings } from '../state/settings'
import { applyUserConfig, captureUserConfig } from './user-config-sync'

describe('user config sync snapshots', () => {
  it('captures LLM settings and preferences', () => {
    settings.value = {
      llm: { ...settings.value.llm, provider: 'anthropic', anthropicApiKey: 'sk-test' },
      locale: 'de',
    }
    layout.value = 'unified'

    const captured = captureUserConfig()
    expect(captured.settings).toMatchObject({ locale: 'de', llm: { provider: 'anthropic', anthropicApiKey: 'sk-test' } })
    expect(captured.preferences.layout).toBe('unified')
  })

  it('applies cloud config', () => {
    const incoming = defaultUserConfig('fr')
    incoming.settings.llm.provider = 'gateway'
    incoming.settings.llm.gatewayToken = 'gw-test'
    incoming.preferences.layout = 'unified'
    incoming.preferences.wrapLines = false

    applyUserConfig(incoming)

    expect(settings.value.locale).toBe('fr')
    expect(settings.value.llm.gatewayToken).toBe('gw-test')
    expect(layout.value).toBe('unified')
  })
})
