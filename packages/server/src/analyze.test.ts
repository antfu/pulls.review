import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import type { AnalysisJobsRepository, StoredAnalysisJob } from './analysis-jobs'
import type { AnalysisResultsRepository, StoredAnalysisResult } from './analysis-results'
import type { Env } from './env'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { describe, expect, it, vi } from 'vitest'
import { resolveAnalysisModel, runAnalysisJob } from './analyze'

const baseJob = { owner: 'octo', repo: 'repo', number: 12, installationId: 55 }

describe('resolveAnalysisModel', () => {
  it('uses the triggering user synced provider, model, and locale', async () => {
    const config = defaultUserConfig('de')
    config.settings.llm.provider = 'anthropic'
    config.settings.llm.anthropicApiKey = 'sk-user'
    config.settings.llm.anthropicModel = 'claude-user-model'

    const result = await resolveAnalysisModel(
      { ANTHROPIC_API_KEY: 'sk-global' } as Env,
      { ...baseJob, configSource: { type: 'user', githubUserId: 42 } },
      { loadUserConfig: vi.fn(async () => config) },
    )

    expect(result.source).toEqual({ type: 'user', githubUserId: 42 })
    expect(result.locale).toBe('de')
    expect(result.resolved.model.id).toBe('claude-user-model')
    expect(result.resolved.apiKey).toBe('sk-user')
  })

  it('defaults legacy jobs to the global host key', async () => {
    const result = await resolveAnalysisModel(
      { ANTHROPIC_API_KEY: 'sk-global', PULLS_REVIEW_LOCALE: 'fr' } as Env,
      baseJob,
    )
    expect(result.source).toEqual({ type: 'global' })
    expect(result.locale).toBe('fr')
    expect(result.resolved.apiKey).toBe('sk-global')
  })

  it('uses the repository automation key and locale for repository jobs', async () => {
    const llm = defaultUserConfig('en').settings.llm
    llm.provider = 'anthropic'
    llm.anthropicApiKey = 'sk-repo'
    llm.anthropicModel = 'claude-repo-model'

    const result = await resolveAnalysisModel(
      {} as Env,
      { ...baseJob, configSource: { type: 'repository', owner: 'octo', repo: 'repo' } },
      {
        loadAutomationConfig: vi.fn(async () => ({
          scope: { type: 'repository' as const, owner: 'octo', repo: 'repo' },
          enabled: true,
          includeDrafts: false,
          publishCheckRun: false,
          excludePaths: [],
          locale: 'fr' as const,
          llm,
          updatedAt: 1,
        })),
      },
    )

    expect(result.source).toEqual({ type: 'repository', owner: 'octo', repo: 'repo' })
    expect(result.locale).toBe('fr')
    expect(result.resolved.apiKey).toBe('sk-repo')
    expect(result.resolved.model.id).toBe('claude-repo-model')
  })

  it('does not silently spend the global key when a user job has no synced key', async () => {
    await expect(resolveAnalysisModel(
      { ANTHROPIC_API_KEY: 'sk-global' } as Env,
      { ...baseJob, configSource: { type: 'user', githubUserId: 42 } },
      { loadUserConfig: vi.fn(async () => null) },
    )).rejects.toThrow(/triggering user.*not configured/i)
  })
})

describe('runAnalysisJob', () => {
  const result: GroupedResult = {
    source: 'llm',
    model: 'anthropic/claude-sonnet-5',
    generatedAt: '2026-10-28T12:00:00.000Z',
    schemaVersion: 1,
    groups: [],
  }
  const diff = {
    ref: { kind: 'github-pr', owner: 'octo', repo: 'repo', number: '12' },
    title: 'Change things',
    files: [],
    head: { sha: 'abc123', ref: 'feature' },
  } as DiffsPayload
  const stored: StoredAnalysisResult = {
    id: 7,
    login: 'pulls-review[bot]',
    updatedAt: 123,
    analysis: { headSha: 'abc123', result },
  }

  function repository(existing: StoredAnalysisResult | null): AnalysisResultsRepository {
    return {
      get: vi.fn(async () => existing),
      list: vi.fn(async () => existing ? [existing] : []),
      put: vi.fn(async () => stored),
    }
  }

  const trackedJob: StoredAnalysisJob = {
    id: 'job-123',
    owner: 'octo',
    repo: 'repo',
    number: 12,
    installationId: 55,
    headSha: 'abc123',
    trigger: 'manual',
    status: 'queued',
    configSource: { type: 'user', githubUserId: 42 },
    attempts: 0,
    createdAt: 100,
    updatedAt: 100,
  }

  function jobs(job: StoredAnalysisJob = trackedJob): AnalysisJobsRepository {
    return {
      create: vi.fn(async () => ({ job, created: true })),
      get: vi.fn(async () => job),
      start: vi.fn(async () => ({ ...job, status: 'running' as const, attempts: 1 })),
      succeed: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      listForRepo: vi.fn(async () => []),
      setCheckRunId: vi.fn(async () => {}),
      skip: vi.fn(async () => {}),
    }
  }

  function deps(results: AnalysisResultsRepository, analyze = vi.fn(async () => ({ result }))) {
    const config = defaultUserConfig('en')
    config.settings.llm.provider = 'anthropic'
    config.settings.llm.anthropicApiKey = 'sk-user'

    return {
      analyze: analyze as never,
      fetchDiff: vi.fn(async () => diff),
      installationToken: vi.fn(async () => 'installation-token'),
      loadUserConfig: vi.fn(async () => config),
      now: () => 123,
      results,
    }
  }

  it('saves a fresh server result to the backend repository', async () => {
    const results = repository(null)
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, configSource: { type: 'user', githubUserId: 42 } },
      deps(results),
    )

    expect(outcome).toMatchObject({ status: 'saved', id: 7 })
    expect(results.put).toHaveBeenCalledWith('octo', 'repo', 12, 'pulls-review[bot]', { headSha: 'abc123', result }, 123)
  })

  it('marks a tracked job running and succeeded with its result id', async () => {
    const tracked = jobs()
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, jobId: 'job-123', configSource: { type: 'user', githubUserId: 42 } },
      { ...deps(repository(null)), jobs: tracked },
    )

    expect(outcome).toMatchObject({ status: 'saved', id: 7 })
    expect(tracked.start).toHaveBeenCalledWith('job-123', 123)
    expect(tracked.succeed).toHaveBeenCalledWith('job-123', 7, 123, expect.objectContaining({ model: 'anthropic/claude-sonnet-5' }))
  })

  it('publishes a neutral check run for repository jobs when enabled', async () => {
    const llm = defaultUserConfig('en').settings.llm
    llm.provider = 'anthropic'
    llm.anthropicApiKey = 'sk-repo'
    const tracked = jobs({ ...trackedJob, trigger: 'webhook', configSource: { type: 'repository', owner: 'octo', repo: 'repo' } })
    const checkRuns = {
      create: vi.fn(async () => 77),
      complete: vi.fn(async () => {}),
    }
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, jobId: 'job-123', headSha: 'abc123', configSource: { type: 'repository', owner: 'octo', repo: 'repo' } },
      {
        ...deps(repository(null)),
        jobs: tracked,
        checkRuns: checkRuns as never,
        loadAutomationConfig: vi.fn(async () => ({
          scope: { type: 'repository' as const, owner: 'octo', repo: 'repo' },
          enabled: true,
          includeDrafts: false,
          publishCheckRun: true,
          excludePaths: [],
          locale: 'en' as const,
          llm,
          updatedAt: 1,
        })),
      },
    )

    expect(outcome).toMatchObject({ status: 'saved', id: 7 })
    expect(checkRuns.create).toHaveBeenCalledWith('installation-token', expect.objectContaining({ headSha: 'abc123', number: 12 }))
    expect(tracked.setCheckRunId).toHaveBeenCalledWith('job-123', 77, 123)
    expect(checkRuns.complete).toHaveBeenCalledWith('installation-token', expect.objectContaining({ number: 12 }), 77, expect.objectContaining({ title: 'Analysis ready' }))
  })

  it('does not spend a model call for a superseded tracked job', async () => {
    const tracked = jobs({ ...trackedJob, status: 'superseded' })
    const analyze = vi.fn(async () => ({ result }))
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, jobId: 'job-123', configSource: { type: 'user', githubUserId: 42 } },
      { ...deps(repository(null), analyze), jobs: tracked },
    )

    expect(outcome).toEqual({ status: 'superseded' })
    expect(analyze).not.toHaveBeenCalled()
    expect(tracked.start).not.toHaveBeenCalled()
  })

  it('passes repository instructions and the previous result as incremental context', async () => {
    const llm = defaultUserConfig('en').settings.llm
    llm.provider = 'anthropic'
    llm.anthropicApiKey = 'sk-repo'
    const older: StoredAnalysisResult = { ...stored, analysis: { headSha: 'old12345', result } }
    const analyze = vi.fn(async () => ({ result }))
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, headSha: 'abc123', configSource: { type: 'repository', owner: 'octo', repo: 'repo' } },
      {
        ...deps(repository(older), analyze),
        fetchInstructions: vi.fn(async () => 'Group migrations separately.'),
        loadAutomationConfig: vi.fn(async () => ({
          scope: { type: 'repository' as const, owner: 'octo', repo: 'repo' },
          enabled: true,
          includeDrafts: false,
          publishCheckRun: false,
          excludePaths: [],
          locale: 'en' as const,
          llm,
          updatedAt: 1,
        })),
      },
    )

    expect(outcome).toMatchObject({ status: 'saved', id: 7 })
    expect(analyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'en',
      expect.objectContaining({
        context: expect.objectContaining({
          instructions: 'Group migrations separately.',
          previous: expect.objectContaining({ headSha: 'old12345' }),
        }),
      }),
    )
  })

  it('skips the model when every changed file is excluded by automation paths', async () => {
    const llm = defaultUserConfig('en').settings.llm
    llm.provider = 'anthropic'
    llm.anthropicApiKey = 'sk-repo'
    const docsDiff = {
      ...diff,
      files: [{ path: 'docs/readme.md', status: 'modified', additions: 1, deletions: 0, isBinary: false, sha: 'x', hunks: [] }],
    } as DiffsPayload
    const analyze = vi.fn(async () => ({ result }))
    const tracked = jobs({ ...trackedJob, trigger: 'webhook', configSource: { type: 'repository', owner: 'octo', repo: 'repo' } })
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, jobId: 'job-123', headSha: 'abc123', configSource: { type: 'repository', owner: 'octo', repo: 'repo' } },
      {
        ...deps(repository(null), analyze),
        fetchDiff: vi.fn(async () => docsDiff),
        jobs: tracked,
        loadAutomationConfig: vi.fn(async () => ({
          scope: { type: 'repository' as const, owner: 'octo', repo: 'repo' },
          enabled: true,
          includeDrafts: false,
          publishCheckRun: false,
          excludePaths: ['docs/**'],
          locale: 'en' as const,
          llm,
          updatedAt: 1,
        })),
      },
    )

    expect(outcome).toEqual({ status: 'skipped' })
    expect(analyze).not.toHaveBeenCalled()
    expect(tracked.skip).toHaveBeenCalledWith('job-123', 123)
  })

  it('skips the model when the backend already has a result for the current head', async () => {
    const results = repository(stored)
    const analyze = vi.fn(async () => ({ result }))
    const outcome = await runAnalysisJob(
      { GITHUB_APP_SLUG: 'pulls-review' } as Env,
      { ...baseJob, configSource: { type: 'user', githubUserId: 42 } },
      deps(results, analyze),
    )

    expect(outcome).toMatchObject({ status: 'up-to-date', id: 7 })
    expect(analyze).not.toHaveBeenCalled()
    expect(results.put).not.toHaveBeenCalled()
  })
})
