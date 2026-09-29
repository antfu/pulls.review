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
  it('starts with the marker, links back with ?from=, and attributes model, time and head', () => {
    const body = renderSharedAnalysisComment(pr, 'antfu', analysis)

    expect(body.split('\n')[0]).toBe('<!-- pulls.review data -->')
    expect(body).toContain('https://pulls.review/gh/vuejs/core/12349?from=antfu')
    expect(body).toContain('analyzed by `anthropic/claude-sonnet-4`')
    expect(body).toContain('2026-09-28 12:34 UTC')
    expect(body).toContain('head abc1234')
  })

  it('round-trips through parse', () => {
    expect(parseSharedAnalysisComment(renderSharedAnalysisComment(pr, 'antfu', analysis))).toEqual(analysis)
  })

  it('falls back to an lz-string block when plain JSON would not fit, and still round-trips', () => {
    const large = { ...analysis, result: { ...analysis.result, overallSummary: 'word '.repeat(14_000) } }
    const body = renderSharedAnalysisComment(pr, 'antfu', large)

    expect(body).not.toContain('```json')
    expect(body).toContain('```lz-string')
    expect(body.length).toBeLessThanOrEqual(60_000)
    expect(parseSharedAnalysisComment(body)).toEqual(large)
  })

  it('refuses a body GitHub would reject even after compression', () => {
    // Random bytes don't compress; hex keeps it a valid JSON string.
    const incompressible = Array.from(crypto.getRandomValues(new Uint8Array(60_000)), byte => byte.toString(16).padStart(2, '0')).join('')
    const huge = { ...analysis, result: { ...analysis.result, overallSummary: incompressible } }
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
    expect(parseSharedAnalysisComment('<!-- pulls.review data -->\n```lz-string\nnot-lz\n```')).toBeUndefined()
  })
})
