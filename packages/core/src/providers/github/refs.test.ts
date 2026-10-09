import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubCommitSource, createGithubCompareSource } from './refs'

const file = { sha: 'blob', filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }
const commit = (sha: string, message: string) => ({ sha, html_url: `https://github.com/o/r/commit/${sha}`, commit: { message, author: { name: 'Dev', date: '2026-01-01T00:00:00Z' } }, author: { login: 'dev', avatar_url: 'https://avatars/dev' }, parents: [{ sha: 'parent' }] })

function stub(routes: Record<string, unknown>) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const path = new URL(url).pathname
    if (!(path in routes))
      return new Response('not found', { status: 404 })
    const body = routes[path]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body))
  }))
  return urls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('github compare source', () => {
  it('diffs head against the merge base and fingerprints by the head ref', async () => {
    const urls = stub({
      '/repos/o/r/compare/main...feat/x': { html_url: 'https://github.com/o/r/compare/main...feat/x', merge_base_commit: { sha: 'base' }, commits: [commit('c1', 'one'), commit('c2', 'two')], files: [{ ...file, sha: null }] },
      '/repos/o/r/commits/feat/x': 'c3\n',
    })
    const source = createGithubCompareSource({ owner: 'o', repo: 'r', base: 'main', head: 'feat/x' })

    const diff = await source.fetch()

    expect(await source.key()).toBe('github:o/r@main...feat/x')
    expect(diff).toMatchObject({
      ref: { kind: 'github-compare', owner: 'o', repo: 'r', base: 'main', head: 'feat/x' },
      title: 'main...feat/x',
      base: { sha: 'base', ref: 'main' },
      head: { sha: 'c2', ref: 'feat/x' },
      commits: [{ sha: 'c1', author: { name: 'dev', avatarUrl: 'https://avatars/dev' }, date: '2026-01-01T00:00:00Z' }, { sha: 'c2' }],
    })
    expect(diff.files[0]).toMatchObject({ path: 'src/a.ts', sha: 'c2:src/a.ts', hunks: [{ header: '@@ -1 +1 @@' }] })
    expect(await source.fingerprint!()).toBe('c3')
    expect(urls[0]).toBe('https://api.github.com/repos/o/r/compare/main...feat/x')
  })
})

describe('github commit source', () => {
  it('diffs a commit against its first parent, with the subject as title', async () => {
    stub({ '/repos/o/r/commits/abc1234def': { ...commit('abc1234def', 'feat: thing\n\nWhy it matters.'), files: [file] } })
    const source = createGithubCommitSource({ owner: 'o', repo: 'r', sha: 'abc1234def' })

    const diff = await source.fetch()

    expect(diff).toMatchObject({
      ref: { kind: 'github-commit', owner: 'o', repo: 'r', sha: 'abc1234def' },
      title: 'feat: thing',
      label: 'abc1234',
      description: 'Why it matters.',
      author: { name: 'dev', avatarUrl: 'https://avatars/dev' },
      base: { sha: 'parent' },
      head: { sha: 'abc1234def' },
    })
    expect(source.fingerprint).toBeUndefined()
    expect(source.reviews).toBeUndefined()
  })
})
