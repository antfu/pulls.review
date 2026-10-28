import type { SharedAnalysis } from '@pulls.review/core/types'
import type { AnalysisResultsRepository, StoredAnalysisResult } from './analysis-results'
import type { Env } from './env'
import { describe, expect, it, vi } from 'vitest'
import { handleAnalysisResults } from './analysis-results'

const analysis: SharedAnalysis = {
  headSha: 'abc123',
  result: {
    source: 'llm',
    model: 'anthropic/claude-sonnet-5',
    generatedAt: '2026-10-28T12:00:00.000Z',
    schemaVersion: 1,
    groups: [],
  },
}

const stored: StoredAnalysisResult = {
  id: 7,
  login: 'pulls-review[bot]',
  updatedAt: Date.UTC(2026, 9, 28, 12, 0, 0),
  analysis,
}

function repository(): AnalysisResultsRepository {
  return {
    get: vi.fn(async () => stored),
    list: vi.fn(async () => [stored]),
    put: vi.fn(async () => stored),
  }
}

describe('handleAnalysisResults', () => {
  it('returns backend results after confirming the viewer can read the pull request', async () => {
    const repo = repository()
    const fetchFn = vi.fn(async (input: string) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo/pulls/12')
      return new Response(JSON.stringify({ id: 99 }), { status: 200 })
    })

    const response = await handleAnalysisResults(
      new Request('https://pulls.shyim.de/api/analysis-results/octo/repo/12'),
      { SESSION_SECRET: 'test-session-secret' } as Env,
      { repository: repo, fetchFn: fetchFn as never },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      results: [{
        id: 7,
        login: 'pulls-review[bot]',
        url: 'https://pulls.shyim.de/gh/octo/repo/12?from=pulls-review%5Bbot%5D',
        updatedAt: '2026-10-28T12:00:00.000Z',
        analysis,
      }],
    })
    expect(repo.list).toHaveBeenCalledWith('octo', 'repo', 12)
  })

  it('returns no stored results when GitHub denies access to the pull request', async () => {
    const repo = repository()
    const response = await handleAnalysisResults(
      new Request('https://pulls.shyim.de/api/analysis-results/octo/repo/12'),
      { SESSION_SECRET: 'test-session-secret' } as Env,
      {
        repository: repo,
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as never,
      },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ results: [] })
  })

  it('uses the GitHub App JWT to confirm anonymous access to a public repository', async () => {
    const appJwt = ['app', 'jwt'].join('-')
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo')
      expect((init?.headers as Headers).get('Authorization')).toBe(`Bearer ${appJwt}`)
      return new Response(JSON.stringify({ private: false }), { status: 200 })
    })

    const response = await handleAnalysisResults(
      new Request('https://pulls.shyim.de/api/analysis-results/octo/repo/12'),
      { SESSION_SECRET: 'test-session-secret', GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: 'key' } as Env,
      { repository: repository(), fetchFn: fetchFn as never, appJwt: vi.fn(async () => appJwt) },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({ results: [{ id: 7 }] })
  })

  it('returns no backend results to anonymous viewers for a private repository', async () => {
    const response = await handleAnalysisResults(
      new Request('https://pulls.shyim.de/api/analysis-results/octo/repo/12'),
      { SESSION_SECRET: 'test-session-secret', GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: 'key' } as Env,
      {
        repository: repository(),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ private: true }), { status: 200 })) as never,
        appJwt: vi.fn(async () => 'app-jwt'),
      },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ results: [] })
  })

  it('rejects malformed pull request coordinates before calling GitHub', async () => {
    const fetchFn = vi.fn()
    const response = await handleAnalysisResults(
      new Request('https://pulls.shyim.de/api/analysis-results/octo/repo/nope'),
      { SESSION_SECRET: 'test-session-secret' } as Env,
      { repository: repository(), fetchFn: fetchFn as never },
    )

    expect(response?.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
