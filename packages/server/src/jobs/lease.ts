import type { AnalysisDeps } from '../analyze'
import type { Database } from '../db/client'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { createSqliteAnalysisJobsRepository } from '../analysis-jobs'
import { createSqliteAnalysisResultsRepository, saveAnalysisResult } from '../analysis-results'

export const JOB_LEASE_MS = 60_000
const MAX_ATTEMPTS = 3

export function claimJob(db: Database, now = Date.now()) {
  return db.transaction(() => {
    // A process crash leaves a running attempt. Recover it before claiming more work.
    db.run(sql`UPDATE analysis_attempt SET status = 'failed', error_code = 'lease_expired', finished_at = ${now}
      WHERE status = 'running' AND job_id IN (
        SELECT id FROM analysis_job WHERE status = 'running' AND lease_expires_at <= ${now})`)
    db.run(sql`UPDATE analysis_job SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
      error_code = 'lease_expired', lease_token = NULL, lease_expires_at = NULL,
      available_at = ${now} + 30000, updated_at = ${now},
      finished_at = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN ${now} ELSE NULL END
      WHERE status = 'running' AND lease_expires_at <= ${now}`)
    const row = db.get<{ id: string }>(sql`SELECT id FROM analysis_job
      WHERE status = 'queued' AND available_at <= ${now} AND attempts < ${MAX_ATTEMPTS}
      ORDER BY available_at, created_at, id LIMIT 1`)
    if (!row)
      return null
    const token = randomUUID()
    db.run(sql`UPDATE analysis_job SET status = 'running', attempts = attempts + 1,
      lease_token = ${token}, lease_expires_at = ${now + JOB_LEASE_MS}, started_at = ${now}, updated_at = ${now}
      WHERE id = ${row.id}`)
    db.run(sql`INSERT INTO analysis_attempt (job_id, attempt_number, status, started_at)
      SELECT id, attempts, 'running', ${now} FROM analysis_job WHERE id = ${row.id}`)
    return { id: row.id, token }
  }, { behavior: 'immediate' })
}

/** A claimed job owns all writes through its lease, including atomic result completion. */
export async function claimAnalysis(db: Database, now: () => number) {
  const claim = claimJob(db, now())
  if (!claim)
    return null
  const jobs = createSqliteAnalysisJobsRepository(db)
  const results = createSqliteAnalysisResultsRepository(db)
  const job = await jobs.get(claim.id)
  if (!job)
    throw new Error('Claimed analysis job is missing')

  const assertLease = () => {
    if (!db.get(sql`SELECT id FROM analysis_job WHERE id = ${claim.id} AND lease_token = ${claim.token}
      AND lease_expires_at > ${now()} AND status IN ('running', 'succeeded')`)) {
      throw new Error('Analysis lease lost')
    }
  }
  const finish = (status: 'succeeded' | 'skipped', resultId?: number, meta?: { model?: string, promptVersion?: number }) => {
    assertLease()
    db.run(sql`UPDATE analysis_job SET status = ${status}, result_id = ${resultId ?? null},
      model = ${meta?.model ?? null}, prompt_version = ${meta?.promptVersion ?? null},
      updated_at = ${now()}, finished_at = ${now()}, error_code = NULL, error_message = NULL WHERE id = ${claim.id}`)
    db.run(sql`UPDATE analysis_attempt SET status = ${status}, finished_at = ${now()}
      WHERE job_id = ${claim.id} AND attempt_number = ${job.attempts}`)
  }
  const dependencies = {
    finalAttempt: job.attempts >= MAX_ATTEMPTS,
    jobs: {
      ...jobs,
      start: async () => {
        assertLease()
        return job
      },
      succeed: async (_, id, _time, meta) => db.transaction(() => finish('succeeded', id, meta)),
      skip: async () => db.transaction(() => finish('skipped')),
      fail: async (_, failure) => {
        db.transaction(() => {
          assertLease()
          if (db.get<{ status: string }>(sql`SELECT status FROM analysis_job WHERE id = ${claim.id}`)?.status === 'succeeded')
            return
          db.run(sql`UPDATE analysis_job SET status = ${failure.final ? 'failed' : 'queued'},
            error_code = ${failure.code}, error_message = ${failure.message.slice(0, 1000)},
            available_at = ${now() + Math.min(300_000, 30_000 * 2 ** (job.attempts - 1))},
            lease_token = NULL, lease_expires_at = NULL, updated_at = ${now()},
            finished_at = ${failure.final ? now() : null} WHERE id = ${claim.id}`)
          db.run(sql`UPDATE analysis_attempt SET status = 'failed', error_code = ${failure.code},
            error_message = ${failure.message.slice(0, 1000)}, finished_at = ${now()}
            WHERE job_id = ${claim.id} AND attempt_number = ${job.attempts}`)
        })
      },
      setCheckRunId: async (_, id) => {
        assertLease()
        db.run(sql`UPDATE analysis_job SET check_run_id = ${id} WHERE id = ${claim.id}`)
      },
    },
    results: {
      ...results,
      put: async (...args) => db.transaction(() => {
        assertLease()
        const stored = saveAnalysisResult(db, ...args)
        finish('succeeded', stored.id, stored.analysis.result)
        return stored
      }),
    },
  } satisfies Pick<AnalysisDeps, 'jobs' | 'results' | 'finalAttempt'>

  return {
    job: { ...job, jobId: job.id },
    dependencies,
    heartbeat() {
      assertLease()
      db.run(sql`UPDATE analysis_job SET lease_expires_at = ${now() + JOB_LEASE_MS}
        WHERE id = ${claim.id} AND lease_token = ${claim.token}`)
    },
  }
}
