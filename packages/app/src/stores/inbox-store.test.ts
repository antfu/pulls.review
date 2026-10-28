import type { InboxItem } from './inbox-store'
import { describe, expect, it } from 'vitest'
import { mergeInboxSections, normalizeInboxItem } from './inbox-store'

function item(number: number, updatedAt: string): InboxItem {
  return {
    owner: 'octo',
    repo: 'repo',
    number,
    title: `PR ${number}`,
    url: `https://github.com/octo/repo/pull/${number}`,
    state: 'open',
    labels: [],
    assignees: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt,
    comments: 0,
    section: 'mentioned',
  }
}

describe('mergeInboxSections', () => {
  it('dedupes by PR keeping the highest-priority section and sorts by update time', () => {
    const merged = mergeInboxSections({
      'needs-review': [item(2, '2026-10-03T00:00:00Z')],
      'assigned': [],
      'authored': [item(1, '2026-10-02T00:00:00Z')],
      'mentioned': [item(2, '2026-10-03T00:00:00Z'), item(3, '2026-10-01T00:00:00Z')],
    })

    expect(merged.map(entry => [entry.number, entry.section])).toEqual([
      [2, 'needs-review'],
      [1, 'authored'],
      [3, 'mentioned'],
    ])
  })
})

describe('normalizeInboxItem', () => {
  it('derives owner and repo from the search result repository URL', () => {
    const normalized = normalizeInboxItem({
      number: 5,
      title: 'Fix it',
      html_url: 'https://github.com/octo/repo/pull/5',
      repository_url: 'https://api.github.com/repos/octo/repo',
      draft: true,
      user: { login: 'octocat', avatar_url: 'https://example.com/a.png' },
      labels: [],
      assignees: [],
      milestone: null,
      comments: 2,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
    }, 'authored')

    expect(normalized).toMatchObject({ owner: 'octo', repo: 'repo', number: 5, state: 'draft', section: 'authored' })
  })
})
