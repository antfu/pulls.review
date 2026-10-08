import type { GitlabDiffJson, GitlabMergeRequestJson } from './api'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { DiffsPayloadSchema } from '../../types/diff'
import { normalizeMergeRequest } from './normalize'

const mr: GitlabMergeRequestJson = {
  title: 'Add a thing',
  description: 'Body',
  state: 'opened',
  draft: false,
  author: { username: 'ada', avatar_url: 'https://gitlab.com/ada.png' },
  source_branch: 'feat/thing',
  target_branch: 'main',
  sha: 'head000',
  diff_refs: { base_sha: 'base000', start_sha: 'start00', head_sha: 'head000' },
  web_url: 'https://gitlab.com/group/sub/project/-/merge_requests/12',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  changes_count: '1',
}

function entry(overrides: Partial<GitlabDiffJson> & { new_path: string }): GitlabDiffJson {
  return { old_path: overrides.new_path, new_file: false, renamed_file: false, deleted_file: false, diff: '', ...overrides }
}

const ref = { project: 'group/sub/project', iid: '12' }

function normalize(diffs: GitlabDiffJson[], rawDiff?: string, overrides: Partial<GitlabMergeRequestJson> = {}) {
  return normalizeMergeRequest('gitlab.com', ref, { ...mr, changes_count: String(diffs.length), ...overrides }, diffs, [], rawDiff)
}

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' one',
  '-two',
  '+2',
  '+three',
  'diff --git a/logo.png b/logo.png',
  'index 3333333..4444444 100644',
  'Binary files a/logo.png and b/logo.png differ',
  'diff --git a/big.lock b/big.lock',
  'index 5555555..6666666 100644',
  '--- a/big.lock',
  '+++ b/big.lock',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n')

describe('normalizeMergeRequest', () => {
  it('maps the merge request onto the canonical payload', async () => {
    const payload = await normalizeMergeRequest('gitlab.com', ref, mr, [], [
      { id: 'c2', message: 'second' },
      { id: 'c1', message: 'first' },
    ], undefined)

    expect(v.is(DiffsPayloadSchema, payload)).toBe(true)
    expect(payload).toMatchObject({
      ref: { kind: 'gitlab-mr', host: 'gitlab.com', project: 'group/sub/project', iid: '12' },
      title: 'Add a thing',
      label: '!12',
      author: { name: 'ada', avatarUrl: 'https://gitlab.com/ada.png' },
      description: 'Body',
      url: 'https://gitlab.com/group/sub/project/-/merge_requests/12',
      base: { sha: 'base000', ref: 'main' },
      head: { sha: 'head000', ref: 'feat/thing' },
      pullRequest: { state: 'open' },
    })
    // GitLab lists newest first; the payload is oldest first.
    expect(payload.commits).toEqual([{ sha: 'c1', message: 'first' }, { sha: 'c2', message: 'second' }])
  })

  it.each([
    [{ state: 'opened', draft: true }, 'draft'],
    [{ state: 'merged', draft: false }, 'merged'],
    [{ state: 'closed', draft: true }, 'closed'],
    [{ state: 'locked', draft: false }, 'closed'],
  ] as const)('reads %o as %s', async (overrides, state) => {
    expect((await normalize([], undefined, overrides)).pullRequest?.state).toBe(state)
  })

  it('normalizes added, removed, modified and renamed files, counting lines from the patch', async () => {
    const { files } = await normalize([
      entry({ new_path: 'new.ts', new_file: true, diff: '@@ -0,0 +1,2 @@\n+a\n+b\n' }),
      entry({ new_path: 'gone.ts', deleted_file: true, diff: '@@ -1 +0,0 @@\n-a\n' }),
      entry({ new_path: 'src/a.ts', diff: '@@ -1,2 +1,3 @@\n one\n-two\n+2\n+three\n' }),
      entry({ new_path: 'moved/b.ts', old_path: 'b.ts', renamed_file: true, diff: '@@ -1 +1 @@\n-x\n+y\n' }),
    ])

    expect(files.map(({ path, previousPath, status, additions, deletions, isBinary }) => ({ path, previousPath, status, additions, deletions, isBinary }))).toEqual([
      { path: 'new.ts', previousPath: undefined, status: 'added', additions: 2, deletions: 0, isBinary: false },
      { path: 'gone.ts', previousPath: undefined, status: 'removed', additions: 0, deletions: 1, isBinary: false },
      { path: 'src/a.ts', previousPath: undefined, status: 'modified', additions: 2, deletions: 1, isBinary: false },
      { path: 'moved/b.ts', previousPath: 'b.ts', status: 'renamed', additions: 1, deletions: 1, isBinary: false },
    ])
    expect(files[2]!.hunks).toEqual([{ header: '@@ -1,2 +1,3 @@', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, patch: ' one\n-two\n+2\n+three' }])
  })

  it('takes the blob sha from the raw diff, not a commit sha', async () => {
    const { files } = await normalize([entry({ new_path: 'src/a.ts', diff: '@@ -1,2 +1,3 @@\n one\n-two\n+2\n+three\n' })], RAW)
    expect(files[0]!.sha).toBe('2222222')
  })

  it('recovers a binary marker and a collapsed patch from the raw diff', async () => {
    const { files } = await normalize([
      entry({ new_path: 'logo.png' }),
      entry({ new_path: 'big.lock', collapsed: true }),
    ], RAW)

    expect(files[0]).toMatchObject({ isBinary: true, sha: '4444444', hunks: [] })
    expect(files[1]).toMatchObject({ isBinary: false, sha: '6666666', additions: 1, deletions: 1 })
    expect(files[1]!.hunks).toHaveLength(1)
    expect(files[1]!.truncated).toBeUndefined()
  })

  it('keeps a file whose patch nothing can supply, marked truncated', async () => {
    const { files } = await normalize([
      entry({ new_path: 'huge.json', too_large: true }),
      entry({ new_path: 'big.lock', collapsed: true }),
    ])

    expect(files.map(file => file.path)).toEqual(['huge.json', 'big.lock'])
    expect(files.every(file => file.truncated === true && file.hunks.length === 0)).toBe(true)
  })

  it('without a raw diff, keys a patch by its content and a patchless file by the head commit', async () => {
    const patched = entry({ new_path: 'src/a.ts', diff: '@@ -1 +1 @@\n-a\n+b\n' })
    const first = await normalize([patched, entry({ new_path: 'logo.png', diff: 'Binary files a/logo.png and b/logo.png differ\n' })])
    const afterPush = await normalize([patched, entry({ new_path: 'logo.png', diff: 'Binary files a/logo.png and b/logo.png differ\n' })], undefined, { diff_refs: { ...mr.diff_refs!, head_sha: 'head111' } })
    const edited = await normalize([{ ...patched, diff: '@@ -1 +1 @@\n-a\n+c\n' }])

    expect(first.files[0]!.sha).toMatch(/^[0-9a-f]{64}$/)
    expect(afterPush.files[0]!.sha).toBe(first.files[0]!.sha)
    expect(edited.files[0]!.sha).not.toBe(first.files[0]!.sha)
    expect(first.files[1]).toMatchObject({ isBinary: true, sha: 'head000:logo.png' })
    expect(afterPush.files[1]!.sha).toBe('head111:logo.png')
  })

  it('flags a listing GitLab cut short instead of passing it off as the whole change', async () => {
    const files = [entry({ new_path: 'a.ts', diff: '@@ -1 +1 @@\n-a\n+b\n' })]
    expect((await normalize(files)).incomplete).toBeUndefined()
    expect((await normalize(files, undefined, { changes_count: '1000+' })).incomplete).toBe(true)
    expect((await normalize(files, undefined, { changes_count: '3' })).incomplete).toBe(true)
  })
})
