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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/pulls/1') ? pr : url.includes('/compare/') ? { merge_base_commit: { sha: 'base' } } : []))))
    const source = createGithubPullRequestSource({ owner: 'o', repo: 'r', number: '1' })

    const diff = await source.fetch()

    expect(diff.ref).toEqual({ kind: 'github-pr', owner: 'o', repo: 'r', number: '1' })
    expect(await source.fingerprint!()).toBe('head')
    expect([source.reviews, source.sharing, source.viewer]).not.toContain(undefined)
  })

  // GitHub's PR patch is against the merge base: a base branch that moved since the PR
  // forked would give old-side contents the hunks don't match.
  it('compares against the merge base, not the base branch tip', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const { pathname } = new URL(url)
      if (pathname === '/repos/o/r/pulls/1')
        return new Response(JSON.stringify(pr))
      if (pathname === '/repos/o/r/compare/base...head')
        return new Response(JSON.stringify({ html_url: '', merge_base_commit: { sha: 'fork-point' }, commits: [] }))
      return new Response('[]')
    }))

    const diff = await createGithubPullRequestSource({ owner: 'o', repo: 'r', number: '1' }).fetch()

    expect(diff.base).toEqual({ sha: 'fork-point', ref: 'main' })
  })
})
