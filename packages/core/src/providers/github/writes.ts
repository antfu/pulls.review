import { diagnostics } from '../../diagnostics'
import { GithubApiError } from './client'

const NEEDS = 'the "repo" scope (classic token) or "Pull requests: Read and write" permission (fine-grained token)'

/** A 403 on a write means the token may not write to this repository. */
export async function asWrite<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  }
  catch (err) {
    throw err instanceof GithubApiError && err.status === 403 ? diagnostics.writeForbidden({ reason: err.message, needs: NEEDS }) : err
  }
}
