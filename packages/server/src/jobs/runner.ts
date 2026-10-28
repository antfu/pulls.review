import type { AnalysisDeps } from '../analyze'
import type { Database } from '../db/client'
import type { Env } from '../env'
import { analysisFailure } from '../analysis-jobs'
import { runAnalysisJob } from '../analyze'
import { claimAnalysis, JOB_LEASE_MS } from './lease'

export function createJobRunner(env: Env & { DB: Database }, deps: AnalysisDeps = {}) {
  const db = env.DB
  const now = deps.now ?? Date.now
  let stopped = false
  let healthy = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> | undefined
  let controller: AbortController | undefined

  async function runNext() {
    const lease = await claimAnalysis(db, now)
    if (!lease)
      return
    const abort = new AbortController()
    controller = abort
    const heartbeat = setInterval(() => {
      try {
        lease.heartbeat()
      }
      catch {
        abort.abort()
      }
    }, JOB_LEASE_MS / 3)
    const timeout = setTimeout(() => abort.abort(), 15 * 60_000)
    try {
      await runAnalysisJob(env, lease.job, {
        ...deps,
        ...lease.dependencies,
        signal: abort.signal,
      })
    }
    catch (error) {
      // The lifecycle handler persisted the failure. Do not log provider keys or payloads.
      console.error(`Analysis ${lease.job.id}: ${analysisFailure(error).code}`)
    }
    finally {
      clearInterval(heartbeat)
      clearTimeout(timeout)
      controller = undefined
    }
  }

  function schedule() {
    if (stopped)
      return
    timer = setTimeout(() => {
      pending = runNext().then(() => {
        healthy = true
      }).catch(() => {
        healthy = false
        console.error('Analysis runner database error')
      }).finally(schedule)
    }, 1000)
    timer.unref()
  }

  return {
    runNext,
    isHealthy: () => healthy,
    start: schedule,
    async stop() {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      await pending
    },
  }
}
