import type { GroupedResult } from '@pulls.review/core/types'
import { defaultLlmSettings } from '@pulls.review/core/analyze'
import { parseSharedAnalysisComment, renderSharedAnalysisComment } from '@pulls.review/core/github'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from './run'

const pr = { owner: 'o', repo: 'r', number: '1' }
const options = { pr, githubToken: 'ghs_token', llm: { ...defaultLlmSettings, provider: 'anthropic' as const, anthropicApiKey: 'sk' }, locale: 'en' as const, log: () => {} }

const result: GroupedResult = {
  source: 'llm',
  generatedAt: '2026-01-01T00:00:00.000Z',
  model: 'anthropic/claude-sonnet-5',
  schemaVersion: 1,
  overallSummary: 'Adds a feature.',
  groups: [{ key: 'feature', label: 'Feature', category: 'core', filePaths: ['a.ts'] }],
}

const analyze = vi.fn(async () => ({ result, transcript: [] }))

/** The GitHub REST surface `run` touches, keyed by `METHOD path`; unlisted calls fail the request. */
function stubGithub(routes: Record<string, unknown>) {
  const calls: { method: string, path: string, body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? 'GET'
    const key = `${method} ${url.pathname}`
    calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (!(key in routes))
      return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  return calls
}

const pullRoutes = {
  'GET /repos/o/r/pulls/1': { title: 'T', body: '', user: { login: 'dev' }, base: { ref: 'main', sha: 'base' }, head: { ref: 'f', sha: 'head456' }, created_at: '', updated_at: '', html_url: 'https://github.com/o/r/pull/1', state: 'open', draft: false, merged: false },
  'GET /repos/o/r/pulls/1/files': [{ sha: 'a', filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n-a\n+b' }],
  'GET /repos/o/r/pulls/1/commits': [],
}

afterEach(() => {
  vi.unstubAllGlobals()
  analyze.mockClear()
})

describe('run', () => {
  it('posts a new shared-analysis comment as the Actions bot when the token cannot identify itself', async () => {
    const calls = stubGithub({
      ...pullRoutes,
      'GET /repos/o/r/issues/1/comments': [],
      'POST /repos/o/r/issues/1/comments': { id: 9, html_url: 'https://github.com/o/r/pull/1#issuecomment-9', user: { login: 'github-actions[bot]' }, body: '', updated_at: '' },
    })

    const outcome = await run(options, analyze)

    expect(outcome).toEqual({ status: 'posted', url: 'https://github.com/o/r/pull/1#issuecomment-9' })
    const post = calls.find(call => call.method === 'POST')!
    const body = (post.body as { body: string }).body
    expect(body).toContain('?from=github-actions[bot]')
    expect(parseSharedAnalysisComment(body)).toEqual({ headSha: 'head456', result })
  })

  it('updates the bot\'s own stale comment instead of adding another', async () => {
    const stale = renderSharedAnalysisComment(pr, 'github-actions[bot]', { headSha: 'old', result })
    const calls = stubGithub({
      ...pullRoutes,
      'GET /repos/o/r/issues/1/comments': [
        { id: 3, user: { login: 'someone-else' }, body: renderSharedAnalysisComment(pr, 'someone-else', { headSha: 'head456', result }), html_url: 'u3', updated_at: '2026-01-02' },
        { id: 5, user: { login: 'github-actions[bot]' }, body: stale, html_url: 'u5', updated_at: '2026-01-01' },
      ],
      'PATCH /repos/o/r/issues/comments/5': { id: 5, html_url: 'u5', user: { login: 'github-actions[bot]' }, body: '', updated_at: '' },
    })

    const outcome = await run(options, analyze)

    expect(outcome).toEqual({ status: 'posted', url: 'u5' })
    expect(calls.map(call => call.method)).not.toContain('POST')
    expect(analyze).toHaveBeenCalledOnce()
  })

  it('skips the model call when the existing comment already covers the head sha', async () => {
    stubGithub({
      ...pullRoutes,
      'GET /user': { login: 'review-bot', avatar_url: '', name: null },
      'GET /repos/o/r/issues/1/comments': [
        { id: 5, user: { login: 'review-bot' }, body: renderSharedAnalysisComment(pr, 'review-bot', { headSha: 'head456', result }), html_url: 'u5', updated_at: '2026-01-01' },
      ],
    })

    const outcome = await run(options, analyze)

    expect(outcome).toEqual({ status: 'up-to-date', url: 'u5' })
    expect(analyze).not.toHaveBeenCalled()
  })

  it('refuses to start without a model for the selected provider', async () => {
    stubGithub(pullRoutes)

    await expect(run({ ...options, llm: defaultLlmSettings }, analyze)).rejects.toMatchObject({ name: 'llmNotConfigured' })
  })
})
