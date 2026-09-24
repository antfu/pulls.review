import type { DiffsPayload } from '../../../types/diff'
import { generateText } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLlmSettings, settings } from '../../../state/settings'
import { llmAdapter } from './index'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateText: vi.fn() }
})

const generateTextMock = vi.mocked(generateText)

function file(path: string, patch = '+x'): DiffsPayload['files'][number] {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    isBinary: false,
    sha: path,
    hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch }],
  }
}

function diffWithFiles(...files: DiffsPayload['files']): DiffsPayload {
  return {
    provider: 'github',
    id: 'github:o/r#1',
    title: 'My PR',
    description: 'Does things',
    files,
  }
}

beforeEach(() => {
  generateTextMock.mockReset()
  settings.value = { ...settings.value, llm: { ...defaultLlmSettings } }
})

describe('llmAdapter.available', () => {
  it('is false with no key/token configured', () => {
    expect(llmAdapter.available).toBe(false)
  })

  it('is true once the selected provider has its token', () => {
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'gateway', gatewayToken: 'gw_token' } }
    expect(llmAdapter.available).toBe(true)
  })

  it('is true for a selected vendor with its key', () => {
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-x' } }
    expect(llmAdapter.available).toBe(true)
  })

  it('ignores tokens of providers that are not selected', () => {
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'gateway', anthropicApiKey: 'sk-ant-x' } }
    expect(llmAdapter.available).toBe(false)
  })
})

describe('llmAdapter.analyze', () => {
  beforeEach(() => {
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-x' } }
  })

  it('throws when not configured', async () => {
    settings.value = { ...settings.value, llm: { ...defaultLlmSettings } }
    await expect(llmAdapter.analyze(diffWithFiles(file('a.ts')))).rejects.toThrow(/not configured/)
  })

  it('maps a well-formed model response into a schema-valid GroupedResult', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        overallSummary: 'Adds a feature.',
        groups: [
          { key: 'feature', label: 'Feature', filePaths: [], children: [{ key: 'feature/core', label: 'Core', filePaths: ['a.ts'] }] },
        ],
      },
    } as any)

    const diff = diffWithFiles(file('a.ts'))
    const result = await llmAdapter.analyze(diff)

    expect(result.source).toBe('llm')
    expect(result.overallSummary).toBe('Adds a feature.')
    expect(result.groups[0]?.children?.[0]?.filePaths).toEqual(['a.ts'])
    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock.mock.calls[0]?.[0].system).toMatch(/json/i)
    expect(generateTextMock.mock.calls[0]?.[0].system).toContain('"overallSummary"')
    expect(generateTextMock.mock.calls[0]?.[0].system).toContain('"groups"')
  })

  it('drops file paths the model hallucinated and re-attaches files it dropped', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        overallSummary: 'Summary.',
        groups: [{ key: 'code', label: 'Code', filePaths: ['a.ts', 'made-up.ts'] }],
      },
    } as any)

    const diff = diffWithFiles(file('a.ts'), file('b.ts'))
    const result = await llmAdapter.analyze(diff)

    const allPaths = result.groups.flatMap(g => [...g.filePaths, ...(g.children?.flatMap(c => c.filePaths) ?? [])])
    expect(allPaths.sort()).toEqual(['a.ts', 'b.ts'])
    expect(result.groups.find(g => g.key === 'llm-unassigned')?.filePaths).toEqual(['b.ts'])
  })

  it('falls back to rule-based grouping instead of throwing when the model call fails', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('network down'))

    const diff = diffWithFiles(file('src/index.ts'))
    const result = await llmAdapter.analyze(diff)

    expect(result.source).toBe('rule-based')
    expect(result.groups.some(g => g.filePaths.includes('src/index.ts'))).toBe(true)
  })

  it('falls back to rule-based grouping when the model output fails schema validation', async () => {
    generateTextMock.mockResolvedValueOnce({ output: { overallSummary: 'ok', groups: 'not-an-array' } } as any)

    const diff = diffWithFiles(file('src/index.ts'))
    const result = await llmAdapter.analyze(diff)

    expect(result.source).toBe('rule-based')
  })

  it('chunks a large diff into multiple model calls and synthesizes one result', async () => {
    const bigPatch = 'x'.repeat(40_000)
    const diff = diffWithFiles(file('a.ts', bigPatch), file('b.ts', bigPatch))

    generateTextMock
      .mockResolvedValueOnce({ output: { summary: 'Part one.', groups: [{ key: 'code', label: 'Code', filePaths: ['a.ts'] }] } } as any)
      .mockResolvedValueOnce({ output: { summary: 'Part two.', groups: [{ key: 'code', label: 'Code', filePaths: ['b.ts'] }] } } as any)
      .mockResolvedValueOnce({ output: { overallSummary: 'Combined summary.' } } as any)

    const result = await llmAdapter.analyze(diff)

    expect(generateTextMock).toHaveBeenCalledTimes(3)
    for (const [request] of generateTextMock.mock.calls)
      expect(request.system).toMatch(/json/i)
    for (const [request] of generateTextMock.mock.calls.slice(0, 2)) {
      expect(request.system).toContain('"summary"')
      expect(request.system).toContain('"groups"')
    }
    expect(generateTextMock.mock.calls[2]?.[0].system).toContain('"overallSummary"')
    expect(result.overallSummary).toBe('Combined summary.')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.filePaths.sort()).toEqual(['a.ts', 'b.ts'])
  })
})
