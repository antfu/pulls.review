import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubPullRequestSource } from './index'

const pr = { title: 'PR', body: '', user: null, base: { ref: 'main', sha: 'base' }, head: { ref: 'feat', sha: 'head' }, created_at: '', updated_at: '', html_url: 'https://github.com/o/r/pull/1', state: 'open', draft: false, merged: false }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('github pull request source', () => {
  it('knows its cache key without a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await createGithubPullRequestSource({ owner: 'o', repo: 'r', number: '1' }).key()).toBe('github:o/r#1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches a payload carrying its ref, and fingerprints by head sha', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/pulls/1') ? pr : []))))
    const source = createGithubPullRequestSource({ owner: 'o', repo: 'r', number: '1' })

    const diff = await source.fetch()

    expect(diff.ref).toEqual({ kind: 'github-pr', owner: 'o', repo: 'r', number: '1' })
    expect(await source.fingerprint!()).toBe('head')
    expect([source.reviews, source.sharing, source.viewer]).not.toContain(undefined)
  })
})
