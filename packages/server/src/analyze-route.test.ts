import type { AnalysisJobsRepository, StoredAnalysisJob } from './analysis-jobs'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthFixture } from './auth-testing'
import { handleAnalyzeRoute } from './github-routes'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

const url = new URL('https://pulls.shyim.de/api/analyze')

function testEnv() {
  return { ...fixture.env }
}

async function analyzeRequest(body: unknown): Promise<Request> {
  return new Request(url, {
    method: 'POST',
    headers: { 'Cookie': fixture.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const trackedJob: StoredAnalysisJob = {
  id: 'job-123',
  owner: 'octo',
  repo: 'repo',
  number: 12,
  installationId: 55,
  trigger: 'manual',
  status: 'queued',
  configSource: { type: 'user', githubUserId: 42 },
  attempts: 0,
  createdAt: 100,
  updatedAt: 100,
}

function jobs(): AnalysisJobsRepository {
  return {
    create: vi.fn(async () => ({ job: trackedJob, created: true })),
    get: vi.fn(async () => trackedJob),
    start: vi.fn(async () => trackedJob),
    succeed: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    listForRepo: vi.fn(async () => []),
    setCheckRunId: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
  }
}

function userConfigWithKey() {
  const config = defaultUserConfig('de')
  config.settings.llm.provider = 'anthropic'
  config.settings.llm.anthropicApiKey = 'sk-user'
  return config
}

describe('handleAnalyzeRoute', () => {
  it('queues with the triggering user identity and ignores a supplied installation id', async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo/pulls/12')
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer access-token-for-test')
      return new Response(JSON.stringify({ id: 123 }), { status: 200 })
    })

    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12, installationId: 999 }),
      testEnv(),
      url,
      {
        loadUserConfig: vi.fn(async () => userConfigWithKey()),
        fetchFn: fetchFn as never,
        findInstallationId: vi.fn(async () => 55),
        jobs: jobs(),
      },
    )

    expect(response?.status).toBe(202)
    expect(await response?.json()).toMatchObject({ ok: true, queued: true, jobId: 'job-123', keySource: 'user', model: 'claude-sonnet-5' })
  })

  it('queues a user-key analysis when the user can read the pull request', async () => {
    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12 }),
      testEnv(),
      url,
      {
        loadUserConfig: vi.fn(async () => userConfigWithKey()),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ id: 123 }), { status: 200 })) as never,
        findInstallationId: vi.fn(async () => 55),
      },
    )
    expect(response?.status).toBe(202)
    expect(await response?.json()).toMatchObject({ keySource: 'user' })
  })

  it('rejects a user-key analysis when the user cannot read the pull request', async () => {
    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12 }),
      testEnv(),
      url,
      {
        loadUserConfig: vi.fn(async () => userConfigWithKey()),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as never,
        findInstallationId: vi.fn(async () => 55),
      },
    )
    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({ error: 'repo_read_access_required' })
  })

  it('still requires repository write access when the host global key pays', async () => {
    const env = testEnv()
    env.ANTHROPIC_API_KEY = 'sk-global'
    const fetchFn = vi.fn(async (input: string) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo/collaborators/octocat/permission')
      return new Response(JSON.stringify({ permission: 'read', role_name: 'read' }), { status: 200 })
    })
    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12 }),
      env,
      url,
      {
        loadUserConfig: vi.fn(async () => null),
        fetchFn: fetchFn as never,
        findInstallationId: vi.fn(async () => 55),
      },
    )
    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({ error: 'repo_write_access_required' })
  })

  it('queues a global-key analysis for a repository writer', async () => {
    const env = testEnv()
    env.ANTHROPIC_API_KEY = 'sk-global'
    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12 }),
      env,
      url,
      {
        loadUserConfig: vi.fn(async () => null),
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ permission: 'write', role_name: 'write' }), { status: 200 })) as never,
        findInstallationId: vi.fn(async () => 55),
      },
    )
    expect(response?.status).toBe(202)
    expect(await response?.json()).toMatchObject({ keySource: 'global' })
  })

  it('returns 422 when neither the user nor the host has a model key', async () => {
    const response = await handleAnalyzeRoute(
      await analyzeRequest({ owner: 'octo', repo: 'repo', number: 12 }),
      testEnv(),
      url,
      {
        loadUserConfig: vi.fn(async () => null),
        fetchFn: vi.fn() as never,
        findInstallationId: vi.fn(async () => 55),
      },
    )
    expect(response?.status).toBe(422)
    expect(await response?.json()).toMatchObject({ error: 'llm_not_configured' })
  })
})
