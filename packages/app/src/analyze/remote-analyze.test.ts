import type { DiffSource, SharedAnalysisComment } from '@pulls.review/core/types'
import { describe, expect, it, vi } from 'vitest'
import { fetchAnalysisFeedback, fetchAnalysisStatuses, fetchAutomationOps, fetchBackendAnalysisResults, fetchRemoteAnalysisJob, submitAnalysisFeedback, triggerRemoteAnalysis, withBackendAnalysisResults } from './remote-analyze'

const pr = { owner: 'octo', repo: 'repo', number: 12 }

describe('triggerRemoteAnalysis', () => {
  it('posts the PR coordinates to the same-origin Worker and returns the resolved key source', async () => {
    const fetchFn = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(input).toBe('/api/analyze')
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('same-origin')
      expect(JSON.parse(init?.body as string)).toEqual(pr)
      return new Response(JSON.stringify({ ok: true, queued: true, jobId: 'job-123', keySource: 'user', provider: 'anthropic', model: 'claude-sonnet-5' }), { status: 202 })
    })

    await expect(triggerRemoteAnalysis(pr, fetchFn as never)).resolves.toEqual({
      jobId: 'job-123',
      keySource: 'user',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    })
  })

  it('surfaces the Worker message on failure', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      error: 'llm_not_configured',
      message: 'Add a model provider key in Settings, or configure a server-side model key on the host.',
    }), { status: 422 }))

    await expect(triggerRemoteAnalysis(pr, fetchFn as never)).rejects.toThrow('Add a model provider key')
  })
})

const backendResult: SharedAnalysisComment = {
  id: 7,
  login: 'pulls-review[bot]',
  url: 'https://diffwise.shyim.de/gh/octo/repo/12?from=pulls-review%5Bbot%5D',
  updatedAt: '2026-10-28T12:00:00.000Z',
  analysis: {
    headSha: 'abc123',
    result: {
      source: 'llm',
      generatedAt: '2026-10-28T12:00:00.000Z',
      schemaVersion: 1,
      groups: [],
      overallSummary: 'Backend result',
    },
  },
}

describe('fetchRemoteAnalysisJob', () => {
  it('loads and validates a tracked job status', async () => {
    const fetchFn = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(input).toBe('/api/analysis-jobs/job-123')
      expect(init?.credentials).toBe('same-origin')
      return new Response(JSON.stringify({
        job: {
          id: 'job-123',
          status: 'succeeded',
          owner: 'octo',
          repo: 'repo',
          number: 12,
          headSha: 'abc123',
          keySource: 'user',
          resultId: 7,
          attempts: 1,
          createdAt: '2026-10-28T12:00:00.000Z',
          updatedAt: '2026-10-28T12:01:00.000Z',
          finishedAt: '2026-10-28T12:01:00.000Z',
        },
      }), { status: 200 })
    })

    await expect(fetchRemoteAnalysisJob('job-123', fetchFn as never)).resolves.toMatchObject({ id: 'job-123', status: 'succeeded', resultId: 7 })
  })
})

describe('fetchAutomationOps', () => {
  it('loads config, usage, and recent jobs for a repository admin', async () => {
    const fetchFn = vi.fn(async (input: unknown) => {
      if (input === '/api/automation/repos/octo/repo')
        return new Response(JSON.stringify({ config: { enabled: true, publishCheckRun: true, monthlyBudgetRuns: 25 } }), { status: 200 })
      if (input === '/api/automation/repos/octo/repo/jobs') {
        return new Response(JSON.stringify({
          usage: { month: '2026-10', runs: 3, budget: 25 },
          jobs: [{ id: 'job-1', status: 'succeeded', owner: 'octo', repo: 'repo', number: 12, attempts: 1, keySource: 'repository' }],
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })

    await expect(fetchAutomationOps({ owner: 'octo', repo: 'repo' }, fetchFn as never)).resolves.toMatchObject({
      config: { enabled: true },
      usage: { runs: 3, budget: 25 },
      jobs: [{ id: 'job-1', status: 'succeeded' }],
    })
  })

  it('returns undefined for non-admins so the panel stays hidden', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'admin_required' }), { status: 403 }))
    await expect(fetchAutomationOps({ owner: 'octo', repo: 'repo' }, fetchFn as never)).resolves.toBeUndefined()
  })
})

describe('fetchAnalysisStatuses', () => {
  it('posts the batch and indexes statuses by PR key', async () => {
    const fetchFn = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(input).toBe('/api/analysis-status')
      expect(JSON.parse(init?.body as string)).toEqual({ prs: [pr] })
      return new Response(JSON.stringify({
        statuses: [{
          owner: 'octo',
          repo: 'repo',
          number: 12,
          analysis: { headSha: 'abc123', updatedAt: '2026-10-28T12:00:00.000Z', groups: 2, criticalGroups: 1 },
          job: { id: 'job-1', status: 'running' },
        }],
      }), { status: 200 })
    })

    const statuses = await fetchAnalysisStatuses([pr], fetchFn as never)
    expect(statuses.get('octo/repo#12')).toMatchObject({ analysis: { groups: 2 }, job: { status: 'running' } })
  })

  it('returns an empty map without a request when given no PRs', async () => {
    const fetchFn = vi.fn()
    await expect(fetchAnalysisStatuses([], fetchFn as never)).resolves.toEqual(new Map())
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('analysis feedback', () => {
  it('submits a rating for the PR latest server result', async () => {
    const fetchFn = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(input).toBe('/api/analysis-feedback')
      expect(JSON.parse(init?.body as string)).toEqual({ owner: 'octo', repo: 'repo', number: 12, rating: 'useful' })
      return new Response(JSON.stringify({ ok: true, resultId: 7 }), { status: 200 })
    })
    await expect(submitAnalysisFeedback(pr, 'useful', undefined, fetchFn as never)).resolves.toBe(true)
  })

  it('loads the viewer rating and totals', async () => {
    const fetchFn = vi.fn(async (input: unknown) => {
      expect(input).toBe('/api/analysis-feedback?owner=octo&repo=repo&number=12')
      return new Response(JSON.stringify({ resultId: 7, mine: { result: 'useful', groups: {} }, totals: { useful: 2, notUseful: 1 } }), { status: 200 })
    })
    await expect(fetchAnalysisFeedback(pr, fetchFn as never)).resolves.toMatchObject({ resultId: 7, mine: { result: 'useful' }, totals: { useful: 2 } })
  })
})

describe('backend analysis results', () => {
  it('fetches and validates results from the Worker', async () => {
    const fetchFn = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(input).toBe('/api/analysis-results/octo/repo/12')
      expect(init?.credentials).toBe('same-origin')
      return new Response(JSON.stringify({ results: [backendResult, { id: 'bad' }] }), { status: 200 })
    })

    await expect(fetchBackendAnalysisResults(pr, fetchFn as never)).resolves.toEqual([backendResult])
  })

  it('prefers the backend bot result over a legacy bot comment while preserving user shares', async () => {
    const userShare = {
      ...backendResult,
      id: 8,
      login: 'octocat',
      updatedAt: '2026-10-27T12:00:00.000Z',
    }
    const legacyBotComment = {
      ...backendResult,
      id: 9,
      updatedAt: '2026-10-26T12:00:00.000Z',
    }
    const upsert = vi.fn(async () => ({ id: 10, url: 'https://example.com/comment' }))
    const source: DiffSource = {
      key: async () => 'github:octo/repo#12',
      fetch: async () => {
        throw new Error('not used')
      },
      sharing: {
        list: vi.fn(async () => [legacyBotComment, userShare]),
        upsert,
      },
    }
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ results: [backendResult] }), { status: 200 }))

    const wrapped = withBackendAnalysisResults(source, pr, fetchFn as never)

    await expect(wrapped.sharing!.list()).resolves.toEqual([backendResult, userShare])
    await expect(wrapped.sharing!.upsert('octocat', backendResult.analysis)).resolves.toEqual({ id: 10, url: 'https://example.com/comment' })
  })
})
