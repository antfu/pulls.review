const GITHUB_API_BASE = 'https://api.github.com'
const PAGE_SIZE = 100

/** A non-ok GitHub response, keeping the status so callers can react to auth/permission failures (401/403). */
export class GithubApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'GithubApiError'
  }
}

export interface GithubRequestOptions {
  method?: string
  body?: object
  /** Media type, e.g. `application/vnd.github.raw` for a file body or `.diff` for diff text. */
  accept?: string
}

/** Every GitHub REST and GraphQL call goes through one of these, bound to the viewer's token. */
export interface GithubClient {
  /** The token requests are sent with; `undefined` means anonymous. */
  token: () => Promise<string | undefined>
  /** `path` is relative to the API root (`/repos/...`). Throws `GithubApiError` on a non-ok response. */
  request: (path: string, options?: GithubRequestOptions) => Promise<Response>
  /** Follows `per_page=100` pages until a short one comes back. */
  paginate: <T>(path: string) => Promise<T[]>
  graphql: <T>(query: string, variables: Record<string, string | number | null>) => Promise<T>
}

export function createGithubClient(token?: string): GithubClient {
  async function request(path: string, options: GithubRequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': options.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (token)
      headers.Authorization = `Bearer ${token}`
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json'
    const url = `${GITHUB_API_BASE}${path}`
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    if (!res.ok) {
      // GitHub's own `message` (e.g. "Resource not accessible by personal access token")
      // makes a permission failure actionable instead of a bare status.
      let message: string | undefined
      try {
        message = (await res.json() as { message?: string }).message
      }
      catch {}
      throw new GithubApiError(res.status, message ?? `GitHub API request failed (${res.status}): ${url}`)
    }
    return res
  }

  return {
    token: async () => token,
    request,
    async paginate<T>(path: string) {
      const items: T[] = []
      const separator = path.includes('?') ? '&' : '?'
      for (let page = 1; ; page++) {
        const pageItems: T[] = await (await request(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`)).json()
        items.push(...pageItems)
        if (pageItems.length < PAGE_SIZE)
          return items
      }
    },
    async graphql<T>(query: string, variables: Record<string, string | number | null>) {
      const payload: { data?: T, errors?: { type?: string, message: string }[] } = await (await request('/graphql', { method: 'POST', body: { query, variables } })).json()
      if (payload.errors?.length) {
        // GraphQL reports permission problems as FORBIDDEN errors on a 200 - map them
        // to the same error type/status the REST layer throws so gating logic is shared.
        const forbidden = payload.errors.some(error => error.type === 'FORBIDDEN')
        throw new GithubApiError(forbidden ? 403 : 500, payload.errors.map(error => error.message).join('; '))
      }
      if (!payload.data)
        throw new GithubApiError(500, 'GitHub GraphQL response contained no data')
      return payload.data
    },
  }
}
