export interface CheckRunTarget {
  owner: string
  repo: string
  number: number
  headSha: string
}

export interface AnalysisCheckRuns {
  create: (token: string, target: CheckRunTarget) => Promise<number | undefined>
  complete: (token: string, target: CheckRunTarget, checkRunId: number, output: { title: string, summary: string }) => Promise<void>
}

const CHECK_RUN_NAME = 'pulls.review analysis'
const SITE_ORIGIN = 'https://pulls.shyim.de'

function detailsUrl(target: CheckRunTarget): string {
  return `${SITE_ORIGIN}/gh/${target.owner}/${target.repo}/${target.number}`
}

function headers(token: string): Headers {
  return new Headers({
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pulls.review',
  })
}

/**
 * Optional GitHub Check Runs for server analysis. Always neutral so the
 * check never gates merging; every failure (including a missing `checks`
 * App permission on older installations) is swallowed.
 */
export function createAnalysisCheckRuns(fetchFn: typeof fetch = fetch): AnalysisCheckRuns {
  return {
    async create(token, target) {
      try {
        const res = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/check-runs`, {
          method: 'POST',
          headers: headers(token),
          body: JSON.stringify({
            name: CHECK_RUN_NAME,
            head_sha: target.headSha,
            status: 'in_progress',
            details_url: detailsUrl(target),
            output: { title: 'Analyzing pull request', summary: 'Server-side grouped analysis is running.' },
          }),
        })
        if (!res.ok)
          return undefined
        const body = await res.json().catch(() => null) as { id?: unknown } | null
        return typeof body?.id === 'number' ? body.id : undefined
      }
      catch {
        return undefined
      }
    },
    async complete(token, target, checkRunId, output) {
      try {
        await fetchFn(`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/check-runs/${checkRunId}`, {
          method: 'PATCH',
          headers: headers(token),
          body: JSON.stringify({
            status: 'completed',
            conclusion: 'neutral',
            details_url: detailsUrl(target),
            output,
          }),
        })
      }
      catch {
        // Check publication is best-effort; the stored result is canonical.
      }
    },
  }
}
