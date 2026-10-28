import type { ScanConfig, ScanSettings } from './api'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { api } from './api'
import { useScanSettings } from './useScanSettings'

vi.mock('./api', () => ({ api: vi.fn(), scanPath: () => '/api/automation/repos/octo/repo' }))
const mockApi = vi.mocked(api)
let scope: ReturnType<typeof effectScope>
let scan: ReturnType<typeof useScanSettings>
let config: ScanConfig
let response: ScanSettings

beforeEach(() => {
  config = {
    enabled: true,
    includeDrafts: false,
    publishCheckRun: true,
    monthlyBudgetRuns: 100,
    excludePaths: [],
    locale: 'en',
    llm: { ...defaultUserConfig().settings.llm, provider: 'anthropic', hasAnthropicKey: true, hasGatewayToken: false, hasOpenaiKey: false },
  }
  response = { config, inherited: null }
  mockApi.mockReset().mockImplementation(async (path, options) => {
    if (options?.method === 'PUT')
      return { config: { ...config, ...(options.body as object) } }
    if (String(path).endsWith('/jobs'))
      return { jobs: [], usage: { runs: 3, budget: 100, month: '2026-10' } }
    if (path === '/api/config')
      return { webhook: true }
    if (String(path).includes('/api/github/repositories/'))
      return { installed: true, suspended: false, archived: false }
    return response
  })
  scope = effectScope()
  scan = scope.run(() => useScanSettings('octo', 'repo'))!
})
afterEach(() => scope.stop())

describe('scan settings editor', () => {
  it('preserves a saved key when saving other settings and clears the dirty state', async () => {
    await scan.load()
    expect(scan.dirty.value).toBe(false)
    expect(scan.storedKey.value).toBe(true)
    scan.draft.value.includeDrafts = true
    await nextTick()
    await scan.save()
    await nextTick()
    const options = mockApi.mock.calls.find(([, options]) => options?.method === 'PUT')![1]!
    expect(options.body).toMatchObject({ enabled: true, includeDrafts: true, llm: { provider: 'anthropic' } })
    expect((options.body as { llm: object }).llm).not.toHaveProperty('anthropicApiKey')
    expect(scan.dirty.value).toBe(false)
    expect(scan.saved.value).toBe(true)
  })

  it('requires a repository key for an override instead of reusing an inherited secret', async () => {
    response = { config: null, inherited: config }
    await scan.load()
    expect(scan.storedKey.value).toBe(false)
    expect(scan.valid.value).toBe(false)
    scan.apiKey.value = 'new-repository-key'
    expect(scan.valid.value).toBe(true)
    await scan.save()
    expect(mockApi).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: expect.objectContaining({ llm: expect.objectContaining({ anthropicApiKey: 'new-repository-key' }) }) }))
    expect(scan.apiKey.value).toBe('')
  })

  it('discards an unsaved key when switching provider', async () => {
    await scan.load()
    scan.apiKey.value = 'anthropic-only-key'
    scan.provider.value = 'gateway'
    expect(scan.apiKey.value).toBe('')
    expect(scan.storedKey.value).toBe(false)
    expect(scan.valid.value).toBe(false)
  })

  it('keeps edits and the replacement key after a failed save', async () => {
    await scan.load()
    scan.apiKey.value = 'replacement-key'
    scan.draft.value.budget = '20'
    mockApi.mockRejectedValueOnce(new Error('offline'))
    await scan.save()
    expect(scan.error.value).toBe('save')
    expect(scan.dirty.value).toBe(true)
    expect(scan.draft.value.budget).toBe('20')
    expect(scan.apiKey.value).toBe('replacement-key')
  })

  it('allows pausing an uninstalled repository but prevents enabling it', async () => {
    await scan.load()
    scan.connection.value = { installed: false, suspended: false, archived: false }
    expect(scan.valid.value).toBe(false)
    scan.draft.value.enabled = false
    expect(scan.valid.value).toBe(true)
  })

  it('validates monthly limits and refreshes history without losing edits', async () => {
    await scan.load()
    for (const budget of ['0', '-1', '1.5', '100001', 'bad']) {
      scan.draft.value.budget = budget
      expect(scan.valid.value).toBe(false)
    }
    scan.draft.value.budget = ''
    expect(scan.valid.value).toBe(true)
    await scan.refreshRuns()
    expect(scan.draft.value.budget).toBe('')
    expect(scan.dirty.value).toBe(true)
  })
})
