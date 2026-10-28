import type { AnalysisJobsRepository, StoredAnalysisJob } from './analysis-jobs'
import type { Env } from './env'
import { describe, expect, it, vi } from 'vitest'
import { createTrackedAnalysisJob, handleAnalysisJobStatus } from './analysis-jobs'

const storedJob: StoredAnalysisJob = {
  id: 'job-123',
  owner: 'octo',
  repo: 'repo',
  number: 12,
  installationId: 55,
  headSha: 'abc123',
  trigger: 'manual',
  status: 'running',
  configSource: { type: 'user', githubUserId: 42 },
  attempts: 1,
  createdAt: 100,
  updatedAt: 110,
  startedAt: 105,
}

function repository(job: StoredAnalysisJob | null = storedJob): AnalysisJobsRepository {
  return {
    create: vi.fn(async () => ({ job: storedJob, created: true })),
    get: vi.fn(async () => job),
    start: vi.fn(async () => storedJob),
    succeed: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    listForRepo: vi.fn(async () => []),
    setCheckRunId: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
  }
}

describe('createTrackedAnalysisJob', () => {
  it('records non-secret provenance before queueing', async () => {
    const repo = repository()
    const created = await createTrackedAnalysisJob(
      {} as Env,
      {
        owner: 'octo',
        repo: 'repo',
        number: 12,
        installationId: 55,
        headSha: 'abc123',
        trigger: 'manual',
        configSource: { type: 'user', githubUserId: 42 },
      },
      { repository: repo, now: () => 100, createId: () => 'job-123' },
    )

    expect(created).toEqual({ job: storedJob, created: true })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'job-123',
      configSource: { type: 'user', githubUserId: 42 },
    }), 100)
    expect(JSON.stringify(created)).not.toContain('apiKey')
  })
})

describe('handleAnalysisJobStatus', () => {
  it('returns a tracked job when GitHub confirms PR read access', async () => {
    const response = await handleAnalysisJobStatus(
      new Request('https://pulls.shyim.de/api/analysis-jobs/job-123'),
      { SESSION_SECRET: 'test-session-secret' } as Env,
      {
        repository: repository(),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ id: 99 }), { status: 200 })) as never,
      },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      job: {
        id: 'job-123',
        status: 'running',
        owner: 'octo',
        repo: 'repo',
        number: 12,
        headSha: 'abc123',
        keySource: 'user',
        attempts: 1,
        createdAt: '1970-01-01T00:00:00.100Z',
        updatedAt: '1970-01-01T00:00:00.110Z',
        startedAt: '1970-01-01T00:00:00.105Z',
      },
    })
  })

  it('hides a tracked job when GitHub denies PR read access', async () => {
    const response = await handleAnalysisJobStatus(
      new Request('https://pulls.shyim.de/api/analysis-jobs/job-123'),
      { SESSION_SECRET: 'test-session-secret' } as Env,
      {
        repository: repository(),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as never,
      },
    )

    expect(response?.status).toBe(404)
    expect(await response?.json()).toEqual({ error: 'not_found' })
  })
})
