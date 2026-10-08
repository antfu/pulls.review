import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PullRequestListPageSchema } from '../../types/pull-request-list'
import { createGitlabClient } from './client'
import { fetchOpenMergeRequests } from './merge-request-list'

const item = {
  iid: 7,
  title: 'Add a thing',
  web_url: 'https://gitlab.com/group/sub/project/-/merge_requests/7',
  draft: true,
  author: { username: 'ada', avatar_url: 'https://gitlab.com/ada.png' },
  labels: [{ name: 'bug', color: '#dc143c', description: null }],
  assignees: [{ username: 'bob', avatar_url: null }],
  milestone: { title: 'v1' },
  user_notes_count: 4,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

function stub(items: unknown[], headers: Record<string, string>) {
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(items), { headers }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchOpenMergeRequests', () => {
  it('asks for open merge requests by latest activity and normalizes each row', async () => {
    const fetchMock = stub([item], { 'x-total': '110', 'x-next-page': '2' })

    const page = await fetchOpenMergeRequests(createGitlabClient('gitlab.com'), 'group/sub/project')

    expect(fetchMock.mock.calls[0]![0]).toBe('https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/merge_requests?state=opened&order_by=updated_at&sort=desc&with_labels_details=true&per_page=100&page=1')
    expect(v.is(PullRequestListPageSchema, page)).toBe(true)
    expect(page).toEqual({
      totalCount: 110,
      next: '2',
      items: [{
        number: 7,
        title: 'Add a thing',
        url: 'https://gitlab.com/group/sub/project/-/merge_requests/7',
        state: 'draft',
        author: { login: 'ada', avatarUrl: 'https://gitlab.com/ada.png' },
        labels: [{ name: 'bug', color: 'dc143c', description: undefined }],
        assignees: [{ login: 'bob', avatarUrl: undefined }],
        milestone: 'v1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        comments: 4,
      }],
    })
  })

  it('continues from the page it was handed, and ends when GitLab names no next one', async () => {
    const fetchMock = stub([{ ...item, draft: false }], { 'x-total': '101', 'x-next-page': '' })

    const page = await fetchOpenMergeRequests(createGitlabClient('gitlab.com'), 'group/project', '2')

    expect(fetchMock.mock.calls[0]![0]).toContain('&page=2')
    expect(page.next).toBeUndefined()
    expect(page.items[0]!.state).toBe('open')
  })

  it('counts what has loaded when GitLab leaves the total out', async () => {
    stub([item, item], { 'x-next-page': '3' })
    expect((await fetchOpenMergeRequests(createGitlabClient('gitlab.com'), 'group/project', '2')).totalCount).toBe(102)
  })
})
