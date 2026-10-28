import type { AnalysisJobsRepository, StoredAnalysisJob } from './analysis-jobs'
import type { AnalysisResultsRepository, StoredAnalysisResult } from './analysis-results'
import type { Env } from './env'
import { describe, expect, it, vi } from 'vitest'
import { handleAnalysisStatusBatch } from './analysis-results'

const result: StoredAnalysisResult = {
  id: 7,
  login: 'pulls-review[bot]',
  updatedAt: Date.UTC(2026, 9, 28, 12),
  analysis: {
    headSha: 'abc123',
    result: {
      source: 'llm',
      generatedAt: '2026-10-28T12:00:00.000Z',
      schemaVersion: 1,
      overallSummary: 'Tightens the auth flow.',
      groups: [{ key: 'auth', label: 'Auth', summary: 's', filePaths: [], critical: true }, { key: 'docs', label: 'Docs', summary: 's', filePaths: [] }],
    },
  },
}

const job: StoredAnalysisJob = {
  id: 'job-1',
  owner: 'octo',
  repo: 'repo',
  number: 12,
  trigger: 'webhook',
  status: 'running',
  configSource: { type: 'repository', owner: 'octo', repo: 'repo' },
  attempts: 1,
  createdAt: 100,
  updatedAt: 110,
}

function results(): AnalysisResultsRepository {
  return {
    get: vi.fn(async () => result),
    list: vi.fn(async () => [result]),
    put: vi.fn(async () => result),
  }
}

function jobs(): AnalysisJobsRepository {
  return {
    create: vi.fn(),
    get: vi.fn(async () => null),
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    listForRepo: vi.fn(async () => [job]),
    setCheckRunId: vi.fn(),
    skip: vi.fn(),
  }
}

function batchRequest(prs: unknown): Request {
  return new Request('https://pulls.shyim.de/api/analysis-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prs }),
  })
}

const publicFetch = () => vi.fn(async () => new Response(JSON.stringify({ private: false }), { status: 200 })) as never
const privateFetch = () => vi.fn(async () => new Response(JSON.stringify({ private: true }), { status: 200 })) as never

describe('handleAnalysisStatusBatch', () => {
  it('returns compact analysis and job status for readable repositories', async () => {
    const response = await handleAnalysisStatusBatch(
      batchRequest([{ owner: 'octo', repo: 'repo', number: 12 }]),
      { SESSION_SECRET: 's', GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { repository: results(), jobs: jobs(), fetchFn: publicFetch(), appJwt: async () => 'jwt' },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      statuses: [{
        owner: 'octo',
        repo: 'repo',
        number: 12,
        analysis: {
          headSha: 'abc123',
          updatedAt: '2026-10-28T12:00:00.000Z',
          summary: 'Tightens the auth flow.',
          groups: 2,
          criticalGroups: 1,
        },
        job: { id: 'job-1', status: 'running' },
      }],
    })
  })

  it('omits repositories the viewer cannot read', async () => {
    const response = await handleAnalysisStatusBatch(
      batchRequest([{ owner: 'octo', repo: 'repo', number: 12 }]),
      { SESSION_SECRET: 's', GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { repository: results(), jobs: jobs(), fetchFn: privateFetch(), appJwt: async () => 'jwt' },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ statuses: [] })
  })

  it('skips the GitHub authorization call for repositories without stored data', async () => {
    const emptyResults: AnalysisResultsRepository = {
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      put: vi.fn(async () => result),
    }
    const emptyJobs = { ...jobs(), listForRepo: vi.fn(async () => []) }
    const fetchFn = vi.fn()
    const response = await handleAnalysisStatusBatch(
      batchRequest([{ owner: 'octo', repo: 'repo', number: 12 }]),
      { SESSION_SECRET: 's', GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { repository: emptyResults, jobs: emptyJobs, fetchFn: fetchFn as never, appJwt: async () => 'jwt' },
    )
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ statuses: [{ owner: 'octo', repo: 'repo', number: 12 }] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects oversized batches', async () => {
    const prs = Array.from({ length: 101 }, (_, i) => ({ owner: 'octo', repo: 'repo', number: i + 1 }))
    const response = await handleAnalysisStatusBatch(
      batchRequest(prs),
      { SESSION_SECRET: 's' } as Env,
      { repository: results(), jobs: jobs(), fetchFn: publicFetch(), appJwt: async () => 'jwt' },
    )
    expect(response?.status).toBe(400)
  })
})
