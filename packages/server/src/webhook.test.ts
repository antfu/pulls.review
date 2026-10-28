import type { AnalysisJobsRepository, StoredAnalysisJob } from './analysis-jobs'
import type { AutomationConfigRepository, StoredAutomationConfig } from './automation-config'
import { describe, expect, it, vi } from 'vitest'
import { testDatabase } from './db/testing'
import { getInstallation } from './installations'
import { analysisJobFromPayload, handleWebhook, verifyWebhookSignature } from './webhook'

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `sha256=${Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('')}`
}

const SECRET = 'webhook-secret'

function webhookRequest(body: object, event: string, signature?: string, delivery = 'delivery-1'): Request {
  return new Request('https://example.com/api/github/webhook', {
    method: 'POST',
    headers: { 'X-GitHub-Event': event, 'X-GitHub-Delivery': delivery, ...(signature ? { 'X-Hub-Signature-256': signature } : {}) },
    body: JSON.stringify(body),
  })
}

const trackedJob: StoredAnalysisJob = {
  id: 'job-456',
  owner: 'o',
  repo: 'r',
  number: 3,
  installationId: 9,
  headSha: 'def',
  trigger: 'webhook',
  deliveryId: 'delivery-1',
  status: 'queued',
  configSource: { type: 'global' },
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

describe('verifyWebhookSignature', () => {
  it('accepts a valid HMAC and rejects tampering', async () => {
    const body = '{"zen":"Keep it logically awesome."}'
    const signature = await sign(SECRET, body)
    expect(await verifyWebhookSignature(SECRET, body, signature)).toBe(true)
    expect(await verifyWebhookSignature(SECRET, `${body} `, signature)).toBe(false)
    expect(await verifyWebhookSignature(SECRET, body, null)).toBe(false)
    expect(await verifyWebhookSignature('other', body, signature)).toBe(false)
  })
})

describe('analysisJobFromPayload', () => {
  const base = {
    installation: { id: 99 },
    pull_request: { number: 12, draft: false, head: { sha: 'abc' } },
    repository: { name: 'repo', owner: { login: 'owner' } },
  }
  it('builds a job for opened/synchronize and skips drafts/closed', () => {
    expect(analysisJobFromPayload({ ...base, action: 'opened' })).toEqual({ owner: 'owner', repo: 'repo', number: 12, installationId: 99, headSha: 'abc' })
    expect(analysisJobFromPayload({ ...base, action: 'synchronize' })).toBeDefined()
    expect(analysisJobFromPayload({ ...base, action: 'closed' })).toBeUndefined()
    expect(analysisJobFromPayload({ ...base, action: 'opened', pull_request: { ...base.pull_request, draft: true } })).toBeUndefined()
    expect(analysisJobFromPayload({ ...base, action: 'ready_for_review', pull_request: { ...base.pull_request, draft: true } })).toBeDefined()
  })
})

function automation(overrides: Partial<StoredAutomationConfig> = {}): AutomationConfigRepository {
  const config: StoredAutomationConfig = {
    scope: { type: 'repository', owner: 'o', repo: 'r' },
    enabled: true,
    includeDrafts: false,
    publishCheckRun: false,
    excludePaths: [],
    monthlyBudgetRuns: 5,
    locale: 'en',
    llm: {
      provider: 'anthropic',
      gatewayToken: '',
      gatewayModel: '',
      anthropicApiKey: 'sk-repo',
      anthropicModel: 'claude-sonnet-5',
      openaiApiKey: '',
      openaiBaseUrl: '',
      openaiModel: '',
    },
    updatedAt: 1,
    ...overrides,
  }
  return {
    get: vi.fn(async scope => scope.type === 'repository' ? config : null),
    put: vi.fn(async c => c),
    delete: vi.fn(async () => {}),
    getUsage: vi.fn(async () => 0),
  }
}

describe('handleWebhook', () => {
  it('returns 503 without a webhook secret and 401 on a bad signature', async () => {
    const payload = { action: 'created' }
    expect((await handleWebhook(webhookRequest(payload, 'installation'), {} as never))?.status).toBe(503)
    expect((await handleWebhook(webhookRequest(payload, 'installation', 'sha256=deadbeef'), { GITHUB_WEBHOOK_SECRET: SECRET } as never))?.status).toBe(401)
  })

  it('records installations in SQLite and answers ping', async () => {
    const storage = testDatabase()
    const env = { GITHUB_WEBHOOK_SECRET: SECRET, DB: storage.db } as never
    const payload = { action: 'created', installation: { id: 5, account: { login: 'octo', type: 'User' }, repository_selection: 'selected' } }
    const res = await handleWebhook(webhookRequest(payload, 'installation', await sign(SECRET, JSON.stringify(payload))), env)
    expect(res?.status).toBe(200)
    expect(await getInstallation(env, 5)).toMatchObject({ id: 5, accountLogin: 'octo' })

    const ping = { zen: 'x' }
    const pong = await handleWebhook(webhookRequest(ping, 'ping', await sign(SECRET, JSON.stringify(ping))), env)
    expect(await pong?.json()).toEqual({ ok: true, pong: true })
  })

  it('requires opt-in automation even when a host key exists', async () => {
    const env = { GITHUB_WEBHOOK_SECRET: SECRET, ANTHROPIC_API_KEY: 'sk-test' } as never
    const payload = {
      action: 'opened',
      installation: { id: 9 },
      pull_request: { number: 3, draft: false, head: { sha: 'def' } },
      repository: { name: 'r', owner: { login: 'o' } },
    }
    const tracked = jobs()
    const res = await handleWebhook(webhookRequest(payload, 'pull_request', await sign(SECRET, JSON.stringify(payload))), env, { jobs: tracked })
    expect(res?.status).toBe(202)
    expect(await res?.json()).toMatchObject({ queued: false, reason: 'repository automation is not enabled' })
    expect(tracked.create).not.toHaveBeenCalled()
  })

  it('queues with the repository automation key even without a host key, and counts usage', async () => {
    const env = { GITHUB_WEBHOOK_SECRET: SECRET } as never
    const payload = {
      action: 'opened',
      installation: { id: 9 },
      pull_request: { number: 3, draft: false, head: { sha: 'def' } },
      repository: { name: 'r', owner: { login: 'o' } },
    }
    const tracked = jobs()
    const auto = automation()
    const res = await handleWebhook(webhookRequest(payload, 'pull_request', await sign(SECRET, JSON.stringify(payload))), env, { jobs: tracked, automation: auto })

    expect(res?.status).toBe(202)
    expect(tracked.create).toHaveBeenCalledWith(expect.objectContaining({
      configSource: { type: 'repository', owner: 'o', repo: 'r' },
      budget: expect.objectContaining({ scopeType: 'repository', scopeKey: 'o/r', limit: 5 }),
    }), expect.any(Number))
  })

  it('does not queue when the repository automation budget is exhausted', async () => {
    const env = { GITHUB_WEBHOOK_SECRET: SECRET } as never
    const payload = {
      action: 'opened',
      installation: { id: 9 },
      pull_request: { number: 3, draft: false, head: { sha: 'def' } },
      repository: { name: 'r', owner: { login: 'o' } },
    }
    const auto = automation()
    auto.getUsage = vi.fn(async () => 5)
    const res = await handleWebhook(webhookRequest(payload, 'pull_request', await sign(SECRET, JSON.stringify(payload))), env, { jobs: jobs(), automation: auto })

    expect(res?.status).toBe(202)
    expect(await res?.json()).toMatchObject({ queued: false, reason: 'automation budget exhausted' })
  })
})
