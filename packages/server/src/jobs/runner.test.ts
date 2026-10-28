import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import type { Env } from '../env'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createSqliteAnalysisJobsRepository } from '../analysis-jobs'
import { createSqliteAnalysisResultsRepository } from '../analysis-results'
import { testDatabase } from '../db/testing'
import { claimJob } from './lease'
import { createJobRunner } from './runner'

const input = { id: 'job-1', owner: 'o', repo: 'r', number: 1, installationId: 9, headSha: 'abc', trigger: 'manual' as const }
const result: GroupedResult = { source: 'llm', model: 'test', generatedAt: new Date(0).toISOString(), schemaVersion: 1, groups: [] }
function setup() {
  const storage = testDatabase()
  const env = { DB: storage.db, ANTHROPIC_API_KEY: 'test', GITHUB_APP_SLUG: 'review' } as Env & { DB: typeof storage.db }
  let time = 1000
  const analyze = vi.fn(async () => ({ result, transcript: [] }))
  const deps = {
    now: () => time,
    analyze,
    fetchDiff: async () => ({ ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' }, title: 'Test', files: [], head: { sha: 'abc', ref: 'feature' } } as DiffsPayload),
    installationToken: async () => 'token',
    fetchInstructions: async () => undefined,
    log: () => {},
  }
  return { storage, env, jobs: createSqliteAnalysisJobsRepository(storage.db), deps, advance: (ms: number) => {
    time += ms
  } }
}

describe('durable SQLite analysis', () => {
  it('deduplicates deliveries, charges a budget once, and rejects over-budget work atomically', async () => {
    const { storage, jobs } = setup()
    const budget = { scopeType: 'repository', scopeKey: 'o/r', month: '2026-10', limit: 1 }
    await jobs.create({ ...input, deliveryId: 'delivery', budget }, 1000)
    expect((await jobs.create({ ...input, id: 'duplicate', deliveryId: 'delivery', budget }, 1000)).created).toBe(false)
    await expect(jobs.create({ ...input, id: 'next', number: 2, budget }, 1000)).rejects.toThrow('automation_budget_exhausted')
    expect(storage.db.get<{ runs: number }>(sql`SELECT runs FROM automation_usage`)?.runs).toBe(1)
    expect(storage.db.all(sql`SELECT id FROM analysis_job`)).toHaveLength(1)
    storage.close()
  })

  it('honors delivery delays and gives a job to only one claimant', async () => {
    const { storage, jobs } = setup()
    await jobs.create({ ...input, availableAt: 2000 }, 1000)
    expect(claimJob(storage.db, 1000)).toBeNull()
    expect(claimJob(storage.db, 2000)?.id).toBe(input.id)
    expect(claimJob(storage.db, 2000)).toBeNull()
    expect((await jobs.get(input.id))?.attempts).toBe(1)
    storage.close()
  })

  it('supersedes old queued heads without spending a model call', async () => {
    const { storage, jobs } = setup()
    await jobs.create(input, 1000)
    await jobs.create({ ...input, id: 'new', headSha: 'new-head' }, 1001)
    expect((await jobs.get(input.id))?.status).toBe('superseded')
    expect(claimJob(storage.db, 1001)?.id).toBe('new')
    storage.close()
  })

  it('saves the result and successful attempt together and never reruns completed jobs', async () => {
    const { storage, env, jobs, deps } = setup()
    await jobs.create(input, 1000)
    const runner = createJobRunner(env, deps)
    await runner.runNext()
    expect(await jobs.get(input.id)).toMatchObject({ status: 'succeeded', attempts: 1 })
    expect(await createSqliteAnalysisResultsRepository(storage.db).get('o', 'r', 1, 'review[bot]')).toMatchObject({ analysis: { headSha: 'abc' } })
    expect(storage.db.get(sql`SELECT status FROM analysis_attempt`)).toEqual({ status: 'succeeded' })
    await runner.runNext()
    expect(deps.analyze).toHaveBeenCalledOnce()
    storage.close()
  })

  it('retries transient failures with backoff and stops after three attempts', async () => {
    const { storage, env, jobs, deps, advance } = setup()
    deps.analyze.mockRejectedValue(new Error('provider unavailable'))
    await jobs.create(input, 1000)
    const runner = createJobRunner(env, deps)
    await runner.runNext()
    expect((await jobs.get(input.id))?.status).toBe('queued')
    await runner.runNext()
    expect(deps.analyze).toHaveBeenCalledTimes(1)
    advance(30_000)
    await runner.runNext()
    advance(60_000)
    await runner.runNext()
    expect(await jobs.get(input.id)).toMatchObject({ status: 'failed', attempts: 3 })
    advance(300_000)
    await runner.runNext()
    expect(deps.analyze).toHaveBeenCalledTimes(3)
    storage.close()
  })

  it('recovers an abandoned lease and rejects completion from its previous owner', async () => {
    const { storage, env, jobs, deps, advance } = setup()
    let complete!: (value: { result: GroupedResult, transcript: never[] }) => void
    deps.analyze.mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    await jobs.create(input, 1000)
    const pending = createJobRunner(env, deps).runNext()
    await vi.waitFor(() => expect(deps.analyze).toHaveBeenCalledOnce())
    advance(61_000)
    expect(claimJob(storage.db, deps.now())).toBeNull()
    advance(30_000)
    const next = claimJob(storage.db, deps.now())
    expect(next?.id).toBe(input.id)
    complete({ result, transcript: [] })
    await pending
    expect((await jobs.get(input.id))?.attempts).toBe(2)
    expect(storage.db.all(sql`SELECT id FROM analysis_result`)).toHaveLength(0)
    storage.close()
  })
})
