import { beforeEach, describe, expect, it, vi } from 'vitest'

// The singleton reads localStorage at import time, so each test re-imports a
// fresh module after seeding storage.
async function loadSettings() {
  vi.resetModules()
  return (await import('./settings')).settings
}

function seedPreProviderSettings(llm: Record<string, string>) {
  localStorage.setItem('diffs:settings', JSON.stringify({
    llm: {
      gatewayToken: '',
      gatewayModel: 'anthropic/claude-sonnet-5',
      anthropicApiKey: '',
      anthropicModel: 'claude-sonnet-5',
      openaiApiKey: '',
      openaiBaseUrl: 'https://api.openai.com/v1',
      openaiModel: 'gpt-5.1',
      ...llm,
    },
  }))
}

describe('settings provider migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to gateway for fresh settings', async () => {
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('gateway')
  })

  it('seeds the provider from the old priority order (gateway wins)', async () => {
    seedPreProviderSettings({ gatewayToken: 'vck_x', anthropicApiKey: 'sk-ant-x' })
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('gateway')
  })

  it('picks anthropic when only a vendor key was configured', async () => {
    seedPreProviderSettings({ anthropicApiKey: 'sk-ant-x' })
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('anthropic')
  })

  it('picks openai-compatible when only an openai key was configured', async () => {
    seedPreProviderSettings({ openaiApiKey: 'sk-x' })
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('openai-compatible')
  })

  it('drops a stored GitHub PAT from settings and local storage', async () => {
    localStorage.setItem('diffs:settings', JSON.stringify({
      githubToken: 'ghp_secret',
      llm: { anthropicApiKey: 'sk-ant-x' },
    }))
    const settings = await loadSettings()
    expect(settings.value).not.toHaveProperty('githubToken')
    expect(localStorage.getItem('diffs:settings')).not.toContain('ghp_secret')
  })

  it('migrates a removed provider selection to the credential-derived one', async () => {
    localStorage.setItem('diffs:settings', JSON.stringify({
      llm: { provider: 'openai-codex', anthropicApiKey: 'sk-ant-x', codexAccessToken: 'cx' },
    }))
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('anthropic')
  })

  it('keeps an explicitly stored provider untouched', async () => {
    localStorage.setItem('diffs:settings', JSON.stringify({
      llm: { provider: 'anthropic', gatewayToken: 'vck_x' },
    }))
    const settings = await loadSettings()
    expect(settings.value.llm.provider).toBe('anthropic')
  })
})
