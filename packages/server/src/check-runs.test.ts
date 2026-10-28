import { describe, expect, it, vi } from 'vitest'
import { createAnalysisCheckRuns } from './check-runs'

const target = { owner: 'octo', repo: 'repo', number: 12, headSha: 'abc123' }

describe('createAnalysisCheckRuns', () => {
  it('creates an in-progress neutral check run linking back to the hosted PR view', async () => {
    const token = ['installation', 'token'].join('-')
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo/check-runs')
      expect((init?.headers as Headers).get('Authorization')).toBe(`Bearer ${token}`)
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      expect(body).toMatchObject({
        name: 'pulls.review analysis',
        head_sha: 'abc123',
        status: 'in_progress',
        details_url: 'https://pulls.shyim.de/gh/octo/repo/12',
      })
      return new Response(JSON.stringify({ id: 77 }), { status: 201 })
    })

    const client = createAnalysisCheckRuns(fetchFn as never)
    await expect(client.create(token, target)).resolves.toBe(77)
  })

  it('completes a check run as neutral so it never gates merging', async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe('https://api.github.com/repos/octo/repo/check-runs/77')
      expect(init?.method).toBe('PATCH')
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      expect(body).toMatchObject({ status: 'completed', conclusion: 'neutral' })
      return new Response(JSON.stringify({ id: 77 }), { status: 200 })
    })

    const client = createAnalysisCheckRuns(fetchFn as never)
    await client.complete('installation-token', target, 77, { title: 'Analysis ready', summary: 'Grouped analysis is available.' })
  })

  it('fails soft when the App lacks the checks permission', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ message: 'Resource not accessible' }), { status: 403 }))
    const client = createAnalysisCheckRuns(fetchFn as never)
    await expect(client.create('installation-token', target)).resolves.toBeUndefined()
    await expect(client.complete('installation-token', target, 77, { title: 'x', summary: 'y' })).resolves.toBeUndefined()
  })
})
