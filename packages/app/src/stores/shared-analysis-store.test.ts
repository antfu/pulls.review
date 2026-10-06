import type { CacheRepositories, PrCacheEntry } from '@pulls.review/core/cache'
import type { GroupedResult } from '@pulls.review/core/types'
import type { MockedFunction } from 'vitest'
import type { LlmRunner } from '../analyze/llm-runner'
import { computeEntrySizeBytes, createCacheRepositories } from '@pulls.review/core/cache'
import { createGithubPullRequestSource, renderSharedAnalysisComment } from '@pulls.review/core/github'
import { staticCredentials } from '@pulls.review/core/types'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixtures/synthetic/empty-group.json'
import { resolveStoredTokenMeta } from '../composables/useGithubTokenMeta'
import { createDiffsStore } from './diffs-store'

let cache: CacheRepositories
const llm: LlmRunner = { isSetup: () => true, analyze: vi.fn(), chat: vi.fn() }

const pr = { owner: 'antfu', repo: 'diffs', number: '1' }
const CACHE_KEY = 'github:antfu/diffs#1'
const diff = fixture.diff as PrCacheEntry['diff']

function aiResult(overrides: Partial<GroupedResult> = {}): GroupedResult {
  return { source: 'llm', model: 'anthropic/claude-sonnet-4', generatedAt: '2026-09-28T12:34:00.000Z', schemaVersion: 1, groups: [], ...overrides }
}

async function seedCache(analyzedBy: PrCacheEntry['analyzedBy'], extra: Partial<PrCacheEntry> = {}) {
  await cache.diffs.put({
    key: CACHE_KEY,
    diff,
    headSha: diff.head!.sha,
    analyzedBy,
    lastViewedAt: Date.now(),
    sizeBytes: computeEntrySizeBytes(diff, analyzedBy),
    ...extra,
  })
}

function storeFor({ token, from }: { token?: string, from?: string } = {}) {
  return createDiffsStore(createGithubPullRequestSource(pr, staticCredentials(token), { tokenMeta: resolveStoredTokenMeta }), { cache, llm, from })
}

interface Route {
  match: (url: string, init?: RequestInit) => boolean
  respond: (init?: RequestInit) => Response
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function stubFetch(routes: Route[]): MockedFunction<typeof fetch> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const route = routes.find(candidate => candidate.match(url, init))
    return route ? route.respond(init) : json({ message: `Unexpected fetch: ${url}` }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock as MockedFunction<typeof fetch>
}

function issueComment(id: number, login: string, result: GroupedResult, headSha = diff.head!.sha, updatedAt = '2026-09-28T00:00:00Z') {
  return {
    id,
    user: { login },
    body: renderSharedAnalysisComment(pr, login, { headSha, result }),
    html_url: `https://github.com/antfu/diffs/pull/1#issuecomment-${id}`,
    updated_at: updatedAt,
  }
}

const userRoute: Route = {
  match: url => url.endsWith('/user'),
  respond: () => new Response(JSON.stringify({ login: 'octocat', avatar_url: '', name: null }), { status: 200, headers: { 'x-oauth-scopes': 'repo' } }),
}

function commentsRoute(comments: unknown[]): Route {
  return { match: (url, init) => url.includes('/issues/1/comments') && (init?.method ?? 'GET') === 'GET', respond: () => json(comments) }
}

/** `discover` runs detached from `load()`; drain it. */
async function settle() {
  for (let i = 0; i < 10; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  cache = createCacheRepositories(createStorage({ driver: memoryDriver() }))
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('discovery', () => {
  it('offers shared analyses newest first, marks own and outdated ones, and skips non-marker comments', async () => {
    await seedCache({})
    stubFetch([userRoute, commentsRoute([
      { id: 1, user: { login: 'someone' }, body: 'LGTM', html_url: '', updated_at: '2026-09-29T00:00:00Z' },
      issueComment(2, 'antfu', aiResult(), diff.head!.sha, '2026-09-27T00:00:00Z'),
      issueComment(3, 'octocat', aiResult(), 'old-sha', '2026-09-28T00:00:00Z'),
    ])])
    const store = storeFor({ token: 't' })

    await store.load()
    await settle()

    expect(store.shared!.candidates.map(c => [c.login, c.own, c.stale])).toEqual([
      ['octocat', true, true],
      ['antfu', false, false],
    ])
    expect(store.shared!.ownComment?.id).toBe(3)
    expect(store.aiResult).toBeUndefined()
  })

  it('does not scan when an AI result already exists', async () => {
    await seedCache({ llm: aiResult() })
    const fetchMock = stubFetch([userRoute, commentsRoute([issueComment(2, 'antfu', aiResult())])])
    const store = storeFor({ token: 't' })

    await store.load()
    await settle()

    expect(store.shared!.candidates).toEqual([])
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/issues/1/comments'))).toBe(false)
  })

  it('auto-loads the github-actions[bot] analysis when there is no AI result', async () => {
    await seedCache({})
    stubFetch([commentsRoute([
      issueComment(2, 'antfu', aiResult(), diff.head!.sha, '2026-09-29T00:00:00Z'),
      issueComment(3, 'github-actions[bot]', aiResult({ overallSummary: 'CI summary' })),
    ])])
    const store = storeFor()

    await store.load()
    await settle()

    expect(store.grouped).toMatchObject({ overallSummary: 'CI summary', sharedBy: 'github-actions[bot]' })
    expect(store.shared!.candidates).toEqual([])
  })

  it('loads a candidate into the cache under its source, credited and without chat', async () => {
    await seedCache({})
    stubFetch([commentsRoute([issueComment(2, 'antfu', aiResult({ overallSummary: 'Shared summary' }))])])
    const store = storeFor()
    await store.load()
    await settle()

    await store.shared!.load('antfu')

    expect(store.analyzeMode).toBe('llm')
    expect(store.grouped).toMatchObject({ overallSummary: 'Shared summary', sharedBy: 'antfu' })
    expect(store.llm!.chat.available).toBe(false)
    expect(store.shared!.candidates).toEqual([])
    const entry = await cache.diffs.get(CACHE_KEY)
    expect(entry!.analyzedBy.llm?.sharedBy).toBe('antfu')
  })

  it('loads a user who is not among the candidates by scanning the comments again', async () => {
    await seedCache({ llm: aiResult({ sharedBy: 'other' }) })
    stubFetch([commentsRoute([issueComment(2, 'antfu', aiResult({ overallSummary: 'Shared summary' }))])])
    const store = storeFor()
    await store.load()
    await settle()
    expect(store.shared!.candidates).toEqual([])

    await store.shared!.load('antfu')

    expect(store.grouped).toMatchObject({ overallSummary: 'Shared summary', sharedBy: 'antfu' })
  })

  it('works anonymously in the embed (no token, LLM compiled out)', async () => {
    vi.stubEnv('PR_LLM', undefined)
    await seedCache({})
    stubFetch([commentsRoute([issueComment(2, 'antfu', aiResult())])])
    const store = storeFor()
    await store.load()
    await settle()

    await store.shared!.load('antfu')

    expect(store.llm).toBeUndefined()
    expect(store.aiResult?.sharedBy).toBe('antfu')
    expect(store.shared!.canShare).toBe(false)

    // A fresh embed store (e.g. next page view) shows the cached shared result without toggling.
    const next = storeFor()
    await next.load()
    expect(next.grouped?.sharedBy).toBe('antfu')
  })
})

describe('?from=', () => {
  it('auto-loads that user when there is no local AI result', async () => {
    await seedCache({})
    stubFetch([commentsRoute([issueComment(2, 'antfu', aiResult()), issueComment(3, 'other', aiResult())])])
    const store = storeFor({ from: 'antfu' })

    await store.load()
    await settle()

    expect(store.aiResult?.sharedBy).toBe('antfu')
    expect(store.shared!.candidates).toEqual([])
  })

  it('only offers that user when a local AI result would be replaced', async () => {
    await seedCache({ llm: aiResult({ overallSummary: 'mine' }) })
    stubFetch([commentsRoute([issueComment(2, 'antfu', aiResult()), issueComment(3, 'other', aiResult())])])
    const store = storeFor({ from: 'antfu' })

    await store.load()
    await settle()

    expect(store.aiResult?.overallSummary).toBe('mine')
    expect(store.shared!.candidates.map(c => c.login)).toEqual(['antfu'])
  })

  it('notices a user who shared nothing and falls back to discovery', async () => {
    await seedCache({})
    stubFetch([commentsRoute([issueComment(3, 'other', aiResult())])])
    const store = storeFor({ from: 'antfu' })

    await store.load()
    await settle()

    expect(store.shared!.notice).toContain('antfu')
    expect(store.shared!.candidates.map(c => c.login)).toEqual(['other'])
  })
})

describe('share', () => {
  function writes(fetchMock: MockedFunction<typeof fetch>) {
    return fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH')
      .map(([url, init]) => `${init!.method} ${String(url).replace('https://api.github.com/repos/antfu/diffs', '')}`)
  }

  it('creates a comment first, then updates the same one, remembering its id', async () => {
    await seedCache({ llm: aiResult() })
    const fetchMock = stubFetch([
      userRoute,
      { match: (url, init) => url.endsWith('/issues/1/comments') && init?.method === 'POST', respond: () => json({ id: 42, html_url: 'https://github.com/antfu/diffs/pull/1#issuecomment-42' }) },
      { match: (url, init) => url.endsWith('/issues/comments/42') && init?.method === 'PATCH', respond: () => json({ id: 42, html_url: 'https://github.com/antfu/diffs/pull/1#issuecomment-42' }) },
      commentsRoute([]),
    ])
    const store = storeFor({ token: 't' })
    await store.load()
    await settle()
    expect(store.shared!.canShare).toBe(true)

    await store.shared!.share()
    await store.shared!.share()

    expect(store.shared!.error).toBeUndefined()
    expect(store.shared!.ownComment).toEqual({ id: 42, url: 'https://github.com/antfu/diffs/pull/1#issuecomment-42' })
    expect(writes(fetchMock)).toEqual(['POST /issues/1/comments', 'PATCH /issues/comments/42'])
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body)).body
    expect(body).toContain('?from=octocat')
    expect((await cache.diffs.get(CACHE_KEY))!.sharedComment?.id).toBe(42)
  })

  it('falls back to scanning for its own comment when the remembered one is gone', async () => {
    await seedCache({ llm: aiResult() }, { sharedComment: { id: 7, url: '' } })
    const fetchMock = stubFetch([
      userRoute,
      { match: (url, init) => url.endsWith('/issues/comments/7') && init?.method === 'PATCH', respond: () => json({ message: 'Not Found' }, 404) },
      { match: (url, init) => url.endsWith('/issues/comments/9') && init?.method === 'PATCH', respond: () => json({ id: 9, html_url: 'u9' }) },
      commentsRoute([issueComment(9, 'octocat', aiResult())]),
    ])
    const store = storeFor({ token: 't' })
    await store.load()
    await settle()

    await store.shared!.share()

    expect(writes(fetchMock)).toEqual(['PATCH /issues/comments/7', 'PATCH /issues/comments/9'])
    expect(store.shared!.ownComment?.id).toBe(9)
  })

  it('surfaces a 403 as an error and flips write access off for reviews too', async () => {
    await seedCache({ llm: aiResult() })
    stubFetch([
      userRoute,
      { match: (url, init) => url.endsWith('/issues/1/comments') && init?.method === 'POST', respond: () => json({ message: 'Resource not accessible' }, 403) },
      commentsRoute([]),
    ])
    const store = storeFor({ token: 't' })
    await store.load()
    await settle()

    await store.shared!.share()

    expect(store.shared!.error?.message).toBe('Resource not accessible')
    expect(store.shared!.canShare).toBe(false)
    expect(store.reviews!.canWrite).toBe(false)
  })

  it('never shares a result that was itself loaded from a comment', async () => {
    await seedCache({ llm: aiResult({ sharedBy: 'antfu' }) })
    const fetchMock = stubFetch([userRoute, commentsRoute([])])
    const store = storeFor({ token: 't' })
    await store.load()
    await settle()

    await store.shared!.share()

    expect(writes(fetchMock)).toEqual([])
  })
})
