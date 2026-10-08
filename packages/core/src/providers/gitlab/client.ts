import type { Credentials } from '../../types/source'

const PAGE_SIZE = 100

/** A non-ok GitLab response, keeping the status so callers can react to auth/permission failures (401/403). */
export class GitlabApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'GitlabApiError'
  }
}

export interface GitlabRequestOptions {
  method?: string
  body?: object
}

/** Every GitLab REST call goes through one of these, bound to one instance and the viewer's token for it. */
export interface GitlabClient {
  host: string
  /** The token requests are sent with; `undefined` means anonymous. */
  token: () => Promise<string | undefined>
  /** `path` is relative to the API root (`/projects/...`). Throws `GitlabApiError` on a non-ok response. */
  request: (path: string, options?: GitlabRequestOptions) => Promise<Response>
  /** Follows the `X-Next-Page` header until GitLab leaves it empty. */
  paginate: <T>(path: string) => Promise<T[]>
}

interface GitlabErrorJson {
  message?: unknown
  error?: string
  error_description?: string
}

/** GitLab words an error as `message` (a string, or an object of field errors) or as OAuth's `error_description`. */
function describeError(body: GitlabErrorJson): string | undefined {
  if (body.error_description)
    return body.error_description
  if (typeof body.message === 'string')
    return body.message
  return body.message === undefined ? body.error : JSON.stringify(body.message)
}

/** A project's full path as the one URL segment the API takes it in. */
export function encodeProject(project: string): string {
  return encodeURIComponent(project)
}

/** Without credentials every request is anonymous. The token is read per request, never captured. */
export function createGitlabClient(host: string, credentials?: Credentials): GitlabClient {
  const token = async () => credentials?.gitlabToken?.(host)

  async function request(path: string, options: GitlabRequestOptions = {}): Promise<Response> {
    const auth = await token()
    const headers: Record<string, string> = {}
    if (auth)
      headers.Authorization = `Bearer ${auth}`
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json'
    const res = await fetch(`https://${host}/api/v4${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    if (!res.ok) {
      let message: string | undefined
      try {
        message = describeError(await res.json())
      }
      catch {}
      message ??= `GitLab API request failed (${res.status})`
      // GitLab answers 404 for a private project it won't confirm exists.
      if (res.status === 404 && !auth)
        message += '. A private project needs a GitLab token.'
      throw new GitlabApiError(res.status, message)
    }
    return res
  }

  return {
    host,
    token,
    request,
    async paginate<T>(path: string) {
      const items: T[] = []
      const separator = path.includes('?') ? '&' : '?'
      for (let page = '1'; page;) {
        const res = await request(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`)
        items.push(...await res.json() as T[])
        page = res.headers.get('x-next-page') ?? ''
      }
      return items
    },
  }
}
