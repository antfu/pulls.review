import type { DiffsPayload, FileChange } from '../../../types/diff'
import type { Analysis } from './schema'
import { toJsonSchema } from '@valibot/to-json-schema'
import { describe, expect, it, vi } from 'vitest'
import { AnalysisSchema } from './schema'
import { createLedger, createReadDiffsTool, createSubmitGroupingTool, createUpdateGroupingTool, findCoverageIssues, prepareGroupingArguments, READ_CALL_CHAR_CAP } from './tools'

function file(overrides: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: 'modified',
    additions: 1,
    deletions: 0,
    isBinary: false,
    sha: overrides.path,
    hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch: 'x' }],
    ...overrides,
  }
}

function diffWithFiles(files: FileChange[]): DiffsPayload {
  return {
    ref: { kind: 'github-pr', owner: 'owner', repo: 'repo', number: '1' },
    title: 'Test PR',
    files,
  }
}

describe('findCoverageIssues', () => {
  const diff = diffWithFiles([file({ path: 'a.ts' }), file({ path: 'b.ts' }), file({ path: 'c.ts' })])

  it('finds missing paths never assigned to a group', () => {
    const analysis: Analysis = { overallSummary: '', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts'] }] }
    expect(findCoverageIssues(diff, analysis)).toEqual({ missing: ['b.ts', 'c.ts'], duplicated: [], unknown: [] })
  })

  it('finds duplicated paths across groups and children', () => {
    const analysis: Analysis = {
      overallSummary: '',
      groups: [
        { key: 'g1', label: 'G1', category: 'core', filePaths: ['a.ts'] },
        { key: 'g2', label: 'G2', category: 'core', filePaths: [], children: [{ key: 'c1', label: 'C1', category: 'core', filePaths: ['a.ts', 'b.ts', 'c.ts'] }] },
      ],
    }
    expect(findCoverageIssues(diff, analysis)).toEqual({ missing: [], duplicated: ['a.ts'], unknown: [] })
  })

  it('finds unknown paths not present in the diff', () => {
    const analysis: Analysis = { overallSummary: '', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts', 'b.ts', 'c.ts', 'z.ts'] }] }
    expect(findCoverageIssues(diff, analysis)).toEqual({ missing: [], duplicated: [], unknown: ['z.ts'] })
  })

  it('reports nothing when every path is covered exactly once', () => {
    const analysis: Analysis = { overallSummary: '', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts', 'b.ts', 'c.ts'] }] }
    expect(findCoverageIssues(diff, analysis)).toEqual({ missing: [], duplicated: [], unknown: [] })
  })
})

describe('createReadDiffsTool', () => {
  it('throws on unknown paths', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' })])
    const tool = createReadDiffsTool(diff, createLedger())
    await expect(tool.execute('id', { paths: ['missing.ts'] })).rejects.toThrow('Unknown paths: missing.ts')
  })

  it('returns a placeholder for a path already read', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' })])
    const ledger = createLedger()
    ledger.readPaths.add('a.ts')
    const tool = createReadDiffsTool(diff, ledger)
    const result = await tool.execute('id', { paths: ['a.ts'] })
    expect(result.content[0]).toEqual({ type: 'text', text: '### a.ts\n(already shown above)' })
  })

  it('splits a call once the per-call cap is exceeded and lists the remaining paths', async () => {
    const big = 'x'.repeat(READ_CALL_CHAR_CAP)
    const files = [
      file({ path: 'a.ts', hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch: big }] }),
      file({ path: 'b.ts' }),
    ]
    const diff = diffWithFiles(files)
    const tool = createReadDiffsTool(diff, createLedger())
    const result = await tool.execute('id', { paths: ['a.ts', 'b.ts'] })
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('Not returned (limit reached), request again: b.ts')
    expect(result.details).toEqual({ paths: ['a.ts'], chars: expect.any(Number) })
  })

  it('truncates a single file larger than the cap on its own', async () => {
    const big = 'x'.repeat(READ_CALL_CHAR_CAP + 100)
    const diff = diffWithFiles([file({ path: 'huge.ts', hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, patch: big }] })])
    const tool = createReadDiffsTool(diff, createLedger())
    const result = await tool.execute('id', { paths: ['huge.ts'] })
    const text = (result.content[0] as { text: string }).text
    expect(text.endsWith('(truncated)')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(READ_CALL_CHAR_CAP + '\n(truncated)'.length)
  })

  it('updates ledger counters after a successful read', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' }), file({ path: 'b.ts' })])
    const ledger = createLedger()
    const tool = createReadDiffsTool(diff, ledger)
    await tool.execute('id', { paths: ['a.ts', 'b.ts'] })
    expect(ledger.readPaths).toEqual(new Set(['a.ts', 'b.ts']))
    expect(ledger.charsRead).toBeGreaterThan(0)
  })
})

describe('createSubmitGroupingTool', () => {
  it('throws on an invalid schema', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' })])
    const tool = createSubmitGroupingTool(diff, createLedger())
    await expect(tool.execute('id', { overallSummary: '' })).rejects.toThrow()
  })

  it('requires a category on every group and child, and advertises the enum to the model', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' })])
    const tool = createSubmitGroupingTool(diff, createLedger())
    await expect(tool.execute('id', { overallSummary: 's', groups: [{ key: 'g', label: 'G', filePaths: ['a.ts'] }] })).rejects.toThrow('category')
    await expect(tool.execute('id', { overallSummary: 's', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: [], children: [{ key: 'c', label: 'C', filePaths: ['a.ts'] }] }] })).rejects.toThrow('category')

    expect(toJsonSchema(AnalysisSchema)).toMatchObject({
      properties: {
        groups: {
          items: {
            required: expect.arrayContaining(['category']),
            properties: {
              category: { enum: expect.arrayContaining(['ui', 'other']) },
              children: { items: { required: expect.arrayContaining(['category']) } },
            },
          },
        },
      },
    })
  })

  it('advertises optional file and line notes and critical flags; line notes always carry a side and line', () => {
    expect(toJsonSchema(AnalysisSchema)).toMatchObject({
      properties: {
        groups: {
          items: {
            required: expect.not.arrayContaining(['fileNotes', 'lineNotes', 'critical']),
            properties: {
              critical: { type: 'boolean' },
              fileNotes: { items: { required: ['path', 'text'], properties: { critical: { type: 'boolean' } } } },
              lineNotes: { items: {
                required: ['path', 'side', 'line', 'text'],
                properties: { line: { type: 'number' }, side: { enum: ['additions', 'deletions'] }, critical: { type: 'boolean' } },
              } },
            },
          },
        },
      },
    })
  })

  it('throws on the first attempt when coverage issues remain, and accepts the second', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' }), file({ path: 'b.ts' })])
    const ledger = createLedger()
    const tool = createSubmitGroupingTool(diff, ledger)
    const incomplete = { overallSummary: 's', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts'] }] }

    await expect(tool.execute('id', incomplete)).rejects.toThrow('Missing paths: b.ts')
    expect(ledger.result).toBeUndefined()

    const result = await tool.execute('id', incomplete)
    expect(result.terminate).toBe(true)
    expect(ledger.result).toEqual(incomplete)
  })

  it('accepts a fully covered grouping on the first attempt', async () => {
    const diff = diffWithFiles([file({ path: 'a.ts' })])
    const ledger = createLedger()
    const tool = createSubmitGroupingTool(diff, ledger)
    const analysis = { overallSummary: 's', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts'] }] }
    const result = await tool.execute('id', analysis)
    expect(result.terminate).toBe(true)
    expect(result.content[0]).toEqual({ type: 'text', text: 'Grouping accepted.' })
    expect(ledger.result).toEqual(analysis)
    expect(ledger.submitAttempts).toBe(1)
  })
})

describe('createUpdateGroupingTool', () => {
  const diff = diffWithFiles([file({ path: 'a.ts' }), file({ path: 'b.ts' })])

  it('throws on an invalid schema', async () => {
    const onUpdate = vi.fn()
    await expect(createUpdateGroupingTool(diff, onUpdate).execute('id', { overallSummary: '' })).rejects.toThrow()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('throws on every attempt while coverage issues remain', async () => {
    const onUpdate = vi.fn()
    const tool = createUpdateGroupingTool(diff, onUpdate)
    const incomplete = { overallSummary: 's', groups: [{ key: 'g', label: 'G', category: 'core', filePaths: ['a.ts', 'z.ts'] }] }

    for (let i = 0; i < 2; i++)
      await expect(tool.execute('id', incomplete)).rejects.toThrow('Missing paths: b.ts\nUnknown paths: z.ts\nFix these and call update_grouping again.')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('passes a covered grouping to onUpdate without terminating', async () => {
    const onUpdate = vi.fn()
    const analysis = { overallSummary: 's', groups: [{ key: 'a', label: 'A', category: 'core', filePaths: ['a.ts'] }, { key: 'b', label: 'B', category: 'core', filePaths: ['b.ts'] }] }
    const result = await createUpdateGroupingTool(diff, onUpdate).execute('id', analysis)
    expect(onUpdate).toHaveBeenCalledWith(analysis)
    expect(result.content[0]).toEqual({ type: 'text', text: 'Grouping updated: 2 groups.' })
    expect(result.terminate).toBeUndefined()
  })
})

describe('prepareGroupingArguments', () => {
  it('parses stringified groups, children and filePaths', () => {
    const args = {
      overallSummary: 'x',
      groups: JSON.stringify([
        { key: 'a', label: 'A', category: 'core', filePaths: '["a.ts"]', children: JSON.stringify([{ key: 'b', label: 'B', category: 'core', filePaths: '["b.ts"]' }]) },
      ]),
    }
    expect(prepareGroupingArguments(args)).toEqual({
      overallSummary: 'x',
      groups: [{ key: 'a', label: 'A', category: 'core', filePaths: ['a.ts'], children: [{ key: 'b', label: 'B', category: 'core', filePaths: ['b.ts'] }] }],
    })
  })

  it('leaves well-formed and unparseable arguments untouched', () => {
    const args = { overallSummary: 'x', groups: [{ key: 'a', label: 'A', category: 'core', filePaths: ['a.ts'] }] }
    expect(prepareGroupingArguments(args)).toEqual(args)
    expect(prepareGroupingArguments({ groups: 'not json' })).toEqual({ groups: 'not json' })
  })
})
