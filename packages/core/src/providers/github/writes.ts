import { diagnostics } from '../../diagnostics'
import { GithubApiError } from './client'

/** A 403 on a write means the token may not write to this repository. */
export async function asWrite<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  }
  catch (err) {
    throw err instanceof GithubApiError && err.status === 403 ? diagnostics.writeForbidden({ reason: err.message }) : err
  }
}
