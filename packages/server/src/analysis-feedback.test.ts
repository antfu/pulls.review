import type { AnalysisFeedbackRepository, StoredFeedback } from './analysis-feedback'
import type { AnalysisResultsRepository, StoredAnalysisResult } from './analysis-results'
import type { Env } from './env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAnalysisFeedback } from './analysis-feedback'
import { createAuthFixture } from './auth-testing'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

const serverResult: StoredAnalysisResult = {
  id: 7,
  login: 'pulls-review[bot]',
  updatedAt: 100,
  analysis: {
    headSha: 'abc123',
    result: { source: 'llm', generatedAt: '2026-10-28T12:00:00.000Z', schemaVersion: 1, groups: [] },
  },
}

function feedbackRepo(rows: StoredFeedback[] = []): AnalysisFeedbackRepository {
  return {
    upsert: vi.fn(async entry => ({ ...entry, createdAt: 1, updatedAt: 1 })),
    listForResult: vi.fn(async () => rows),
  }
}

function results(): AnalysisResultsRepository {
  return {
    get: vi.fn(async () => serverResult),
    list: vi.fn(async () => [serverResult]),
    put: vi.fn(async () => serverResult),
  }
}

async function authed(url: string, init: RequestInit = {}): Promise<Request> {
  return new Request(url, { ...init, headers: { 'Cookie': fixture.cookie, 'Content-Type': 'application/json' } })
}

function env(): Env {
  return { ...fixture.env, GITHUB_APP_SLUG: 'pulls-review' }
}

const readFetch = () => vi.fn(async () => new Response(JSON.stringify({ id: 99 }), { status: 200 })) as never
const deniedFetch = () => vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as never

describe('handleAnalysisFeedback', () => {
  it('stores a signed-in reader rating against the latest server result', async () => {
    const feedback = feedbackRepo()
    const response = await handleAnalysisFeedback(
      await authed('https://pulls.shyim.de/api/analysis-feedback', {
        method: 'POST',
        body: JSON.stringify({ owner: 'octo', repo: 'repo', number: 12, rating: 'useful' }),
      }),
      env(),
      { feedback, results: results(), fetchFn: readFetch(), now: () => 500 },
    )

    expect(response?.status).toBe(200)
    expect(feedback.upsert).toHaveBeenCalledWith(expect.objectContaining({
      resultId: 7,
      owner: 'octo',
      repo: 'repo',
      number: 12,
      githubUserId: 42,
      rating: 'useful',
      groupKey: '',
    }), 500)
  })

  it('rejects feedback from a user who cannot read the pull request', async () => {
    const feedback = feedbackRepo()
    const response = await handleAnalysisFeedback(
      await authed('https://pulls.shyim.de/api/analysis-feedback', {
        method: 'POST',
        body: JSON.stringify({ owner: 'octo', repo: 'repo', number: 12, rating: 'useful' }),
      }),
      env(),
      { feedback, results: results(), fetchFn: deniedFetch(), now: () => 500 },
    )

    expect(response?.status).toBe(403)
    expect(feedback.upsert).not.toHaveBeenCalled()
  })

  it('returns the viewer rating and totals for the latest server result', async () => {
    const rows: StoredFeedback[] = [
      { resultId: 7, owner: 'octo', repo: 'repo', number: 12, githubUserId: 42, rating: 'useful', groupKey: '', createdAt: 1, updatedAt: 1 },
      { resultId: 7, owner: 'octo', repo: 'repo', number: 12, githubUserId: 9, rating: 'not_useful', groupKey: '', createdAt: 1, updatedAt: 1 },
      { resultId: 7, owner: 'octo', repo: 'repo', number: 12, githubUserId: 42, rating: 'not_useful', groupKey: 'auth', createdAt: 1, updatedAt: 1 },
    ]
    const response = await handleAnalysisFeedback(
      await authed('https://pulls.shyim.de/api/analysis-feedback?owner=octo&repo=repo&number=12'),
      env(),
      { feedback: feedbackRepo(rows), results: results(), fetchFn: readFetch() },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      resultId: 7,
      mine: { result: 'useful', groups: { auth: 'not_useful' } },
      totals: { useful: 1, notUseful: 1 },
    })
  })

  it('rejects an invalid rating', async () => {
    const response = await handleAnalysisFeedback(
      await authed('https://pulls.shyim.de/api/analysis-feedback', {
        method: 'POST',
        body: JSON.stringify({ owner: 'octo', repo: 'repo', number: 12, rating: 'great' }),
      }),
      env(),
      { feedback: feedbackRepo(), results: results(), fetchFn: readFetch() },
    )
    expect(response?.status).toBe(400)
  })
})
