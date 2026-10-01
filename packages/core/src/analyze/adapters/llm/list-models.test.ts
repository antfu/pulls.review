import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from './list-models'
import { defaultLlmSettings } from './settings'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('listModels (gateway)', () => {
  // The gateway wire format (`GET …/config`): per-token USD prices as strings.
  const wireModel = {
    specification: { specificationVersion: 'v4', provider: 'gateway', modelId: 'x' },
  }

  it('maps the catalog, scaling pricing to USD per 1M tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      models: [
        { ...wireModel, id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: '0.000003', output: '0.000015' } },
        { ...wireModel, id: 'meta/free-model', name: 'Free Model', pricing: { input: '0', output: '0' } },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await listModels({ ...defaultLlmSettings, provider: 'gateway', gatewayToken: 'vck_x' })

    expect(models).toEqual([
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: 3, output: 15 } },
      { id: 'meta/free-model', name: 'Free Model', pricing: { input: 0, output: 0 } },
    ])
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/config$/)
  })

  it('drops non-language models (embeddings, images, …)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      models: [
        { ...wireModel, id: 'openai/text-embedding-3', name: 'Embedding', modelType: 'embedding' },
        { ...wireModel, id: 'openai/gpt-5.1', name: 'GPT-5.1', modelType: 'language' },
      ],
    })))

    const models = await listModels({ ...defaultLlmSettings, provider: 'gateway', gatewayToken: 'vck_x' })

    expect(models.map(m => m.id)).toEqual(['openai/gpt-5.1'])
  })
})

describe('listModels (anthropic)', () => {
  it('maps ids and display names, without pricing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await listModels({ ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-x' })

    expect(models).toEqual([{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5' }])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x')
  })
})

describe('listModels (openai-compatible)', () => {
  it('lists /models from the configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-5.1' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await listModels({
      ...defaultLlmSettings,
      provider: 'openai-compatible',
      openaiApiKey: 'sk-x',
      openaiBaseUrl: 'https://llm.example.com/v1/',
    })

    expect(models).toEqual([{ id: 'gpt-5.1', name: 'gpt-5.1' }])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://llm.example.com/v1/models')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })))

    await expect(listModels({ ...defaultLlmSettings, provider: 'openai-compatible', openaiApiKey: 'bad' }))
      .rejects
      .toThrow(/Model list request failed \(401\)/)
  })
})
