import { diagnostics } from '../../diagnostics'
import { GitlabApiError } from './client'

const NEEDS = 'the "api" scope, held by a project member who may comment'

/** A 403 on a write means the token lacks the `api` scope, or its user may not write to this project. */
export async function asWrite<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  }
  catch (err) {
    throw err instanceof GitlabApiError && err.status === 403 ? diagnostics.writeForbidden({ reason: err.message, needs: NEEDS }) : err
  }
}
