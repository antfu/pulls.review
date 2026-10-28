import type { AutomationConfigRepository, StoredAutomationConfig } from './automation-config'
import type { Env } from './env'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthFixture } from './auth-testing'
import { handleAutomationConfig, resolveAutomation } from './automation-config'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

function llmWithKey() {
  const llm = defaultUserConfig('en').settings.llm
  llm.provider = 'anthropic'
  llm.anthropicApiKey = 'sk-repo'
  return llm
}

const repoConfig: StoredAutomationConfig = {
  scope: { type: 'repository', owner: 'octo', repo: 'repo' },
  enabled: true,
  includeDrafts: false,
  publishCheckRun: false,
  excludePaths: [],
  monthlyBudgetRuns: 25,
  locale: 'de',
  llm: llmWithKey(),
  updatedAt: 100,
}

const orgConfig: StoredAutomationConfig = {
  scope: { type: 'organization', owner: 'octo' },
  enabled: true,
  includeDrafts: true,
  publishCheckRun: false,
  excludePaths: [],
  locale: 'en',
  llm: llmWithKey(),
  updatedAt: 90,
}

function repository(configs: Record<string, StoredAutomationConfig | null> = {}): AutomationConfigRepository {
  return {
    get: vi.fn(async (scope) => {
      const key = scope.type === 'repository' ? `repo:${scope.owner}/${scope.repo}` : `org:${scope.owner}`
      return configs[key] ?? null
    }),
    put: vi.fn(async config => config),
    delete: vi.fn(async () => {}),
    getUsage: vi.fn(async () => 0),
  }
}

async function authedRequest(url: string, init: RequestInit = {}): Promise<Request> {
  return new Request(url, {
    ...init,
    headers: { 'Cookie': fixture.cookie, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })
}

function env(): Env {
  return { ...fixture.env, GITHUB_APP_SLUG: 'pulls-review' }
}

const adminFetch = () => vi.fn(async () => new Response(JSON.stringify({ permission: 'admin', role_name: 'admin' }), { status: 200 })) as never
const writeFetch = () => vi.fn(async () => new Response(JSON.stringify({ permission: 'write', role_name: 'write' }), { status: 200 })) as never

describe('handleAutomationConfig', () => {
  it('returns repository settings to an admin without exposing provider keys', async () => {
    const response = await handleAutomationConfig(
      await authedRequest('https://pulls.shyim.de/api/automation/repos/octo/repo'),
      env(),
      { repository: repository({ 'repo:octo/repo': repoConfig }), fetchFn: adminFetch() },
    )

    expect(response?.status).toBe(200)
    const body = await response?.json() as { config: unknown }
    expect(body.config).toMatchObject({
      enabled: true,
      monthlyBudgetRuns: 25,
      locale: 'de',
      llm: { provider: 'anthropic', hasAnthropicKey: true },
    })
    expect(JSON.stringify(body)).not.toContain('sk-repo')
  })

  it('rejects settings writes from a non-admin repository member', async () => {
    const repo = repository()
    const response = await handleAutomationConfig(
      await authedRequest('https://pulls.shyim.de/api/automation/repos/octo/repo', {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      }),
      env(),
      { repository: repo, fetchFn: writeFetch(), now: () => 200 },
    )

    expect(response?.status).toBe(403)
    expect(repo.put).not.toHaveBeenCalled()
  })

  it('preserves the stored provider key when an admin updates other settings', async () => {
    const repo = repository({ 'repo:octo/repo': repoConfig })
    const response = await handleAutomationConfig(
      await authedRequest('https://pulls.shyim.de/api/automation/repos/octo/repo', {
        method: 'PUT',
        body: JSON.stringify({ monthlyBudgetRuns: 10, llm: { provider: 'anthropic', anthropicModel: 'claude-new' } }),
      }),
      env(),
      { repository: repo, fetchFn: adminFetch(), now: () => 200 },
    )

    expect(response?.status).toBe(200)
    expect(repo.put).toHaveBeenCalledWith(expect.objectContaining({
      monthlyBudgetRuns: 10,
      llm: expect.objectContaining({ anthropicApiKey: 'sk-repo', anthropicModel: 'claude-new' }),
    }), 200)
  })
})

describe('automation jobs operations view', () => {
  it('lists recent tracked jobs and monthly usage for a repository admin', async () => {
    const repo = repository({ 'repo:octo/repo': repoConfig })
    repo.getUsage = vi.fn(async () => 3)
    const jobsRepo = {
      create: vi.fn(),
      get: vi.fn(async () => null),
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      setCheckRunId: vi.fn(),
      skip: vi.fn(),
      listForRepo: vi.fn(async () => [{
        id: 'job-1',
        owner: 'octo',
        repo: 'repo',
        number: 12,
        trigger: 'webhook' as const,
        status: 'succeeded' as const,
        configSource: { type: 'repository' as const, owner: 'octo', repo: 'repo' },
        resultId: 7,
        attempts: 1,
        createdAt: 100,
        updatedAt: 110,
      }]),
    }
    const response = await handleAutomationConfig(
      await authedRequest('https://pulls.shyim.de/api/automation/repos/octo/repo/jobs'),
      env(),
      { repository: repo, jobs: jobsRepo as never, fetchFn: adminFetch(), now: () => Date.UTC(2026, 9, 28) },
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({
      usage: { month: '2026-10', runs: 3, budget: 25 },
      jobs: [{ id: 'job-1', status: 'succeeded', keySource: 'repository' }],
    })
    expect(jobsRepo.listForRepo).toHaveBeenCalledWith('octo', 'repo', 20)
  })
})

describe('resolveAutomation', () => {
  it('prefers an enabled repository config over the organization config', async () => {
    const resolved = await resolveAutomation(repository({ 'repo:octo/repo': repoConfig, 'org:octo': orgConfig }), 'octo', 'repo')
    expect(resolved?.source).toEqual({ type: 'repository', owner: 'octo', repo: 'repo' })
  })

  it('treats a disabled repository config as an explicit opt-out', async () => {
    const resolved = await resolveAutomation(repository({
      'repo:octo/repo': { ...repoConfig, enabled: false },
      'org:octo': orgConfig,
    }), 'octo', 'repo')
    expect(resolved).toBeNull()
  })

  it('falls back to an enabled organization config', async () => {
    const resolved = await resolveAutomation(repository({ 'org:octo': orgConfig }), 'octo', 'repo')
    expect(resolved?.source).toEqual({ type: 'organization', owner: 'octo' })
  })
})
