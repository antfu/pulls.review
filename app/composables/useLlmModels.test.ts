import type { EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { defaultLlmSettings, settings } from '../state/settings'
import { useLlmModels } from './useLlmModels'

const STORAGE_KEY = 'diffs:llm-models'

function anthropicResponse(): Response {
  return new Response(
    JSON.stringify({ data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }] }),
    { status: 200 },
  )
}

describe('useLlmModels', () => {
  let scope: EffectScope

  beforeEach(() => {
    scope = effectScope()
    localStorage.removeItem(STORAGE_KEY)
    settings.value = { githubToken: '', llm: { ...defaultLlmSettings } }
  })

  afterEach(() => {
    scope.stop()
    vi.unstubAllGlobals()
  })

  function setup() {
    return scope.run(() => useLlmModels())!
  }

  it('stays empty and never fetches while the selected provider has no token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { models, loading } = setup()
    await vi.waitFor(() => expect(loading.value).toBe(false))

    expect(models.value).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the selected provider catalog once the token is set, and caches it by hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicResponse())
    vi.stubGlobal('fetch', fetchMock)
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-x' } }

    const { models } = setup()

    await vi.waitFor(() => expect(models.value).toEqual([{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5' }]))
    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(raw).not.toContain('sk-ant-x')
    expect(JSON.parse(raw).anthropic.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reuses the cached catalog for unchanged credentials instead of refetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicResponse())
    vi.stubGlobal('fetch', fetchMock)
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-x' } }
    const first = setup()
    await vi.waitFor(() => expect(first.models.value).not.toBeNull())

    const second = scope.run(() => useLlmModels())!
    await vi.waitFor(() => expect(second.models.value).not.toBeNull())

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a fetch failure so the UI can fall back to manual entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })))
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'bad' } }

    const { models, error } = setup()

    await vi.waitFor(() => expect(error.value).toMatch(/401/))
    expect(models.value).toBeNull()
  })
})
