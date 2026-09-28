import type { SharedAnalysis } from '../../types/shared-analysis'
import { describe, expect, it } from 'vitest'
import { parseSharedAnalysisComment, renderSharedAnalysisComment } from './shared-analysis-comment'

const pr = { owner: 'vuejs', repo: 'core', number: '12349' }

const analysis: SharedAnalysis = {
  headSha: 'abc1234def5678',
  result: {
    source: 'llm',
    model: 'anthropic/claude-sonnet-4',
    generatedAt: '2026-09-28T12:34:56.000Z',
    schemaVersion: 1,
    overallSummary: 'Refactors the **reactivity** core.',
    groups: [{ key: 'core', label: 'Core', summary: 'Main change.', filePaths: ['packages/reactivity/src/effect.ts'] }],
  },
}

describe('renderSharedAnalysisComment', () => {
  it('starts with the marker, links back with ?from=, and labels the summary', () => {
    const body = renderSharedAnalysisComment(pr, 'antfu', analysis)

    expect(body.split('\n')[0]).toBe('<!-- pulls.review data -->')
    expect(body).toContain('https://pulls.review/gh/vuejs/core/12349?from=antfu')
    expect(body).toContain('<summary>Analyzed by anthropic/claude-sonnet-4 at 2026-09-28 12:34 UTC · head abc1234</summary>')
  })

  it('round-trips through parse', () => {
    expect(parseSharedAnalysisComment(renderSharedAnalysisComment(pr, 'antfu', analysis))).toEqual(analysis)
  })

  it('refuses a body GitHub would reject', () => {
    const huge = { ...analysis, result: { ...analysis.result, overallSummary: 'x'.repeat(70_000) } }
    expect(() => renderSharedAnalysisComment(pr, 'antfu', huge)).toThrow(/too large/)
  })
})

describe('parseSharedAnalysisComment', () => {
  it('ignores comments without the marker, even with a matching json block', () => {
    const body = renderSharedAnalysisComment(pr, 'antfu', analysis).split('\n').slice(1).join('\n')
    expect(parseSharedAnalysisComment(body)).toBeUndefined()
  })

  it('ignores a marked comment whose payload is malformed or off-schema', () => {
    expect(parseSharedAnalysisComment('<!-- pulls.review data -->\n```json\n{ not json\n```')).toBeUndefined()
    expect(parseSharedAnalysisComment('<!-- pulls.review data -->\n```json\n{ "headSha": "x" }\n```')).toBeUndefined()
    expect(parseSharedAnalysisComment('<!-- pulls.review data -->\nno block')).toBeUndefined()
  })
})
