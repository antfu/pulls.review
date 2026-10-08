/**
 * A gitlab.com merge request as its REST API answers, hand-authored after the shapes
 * of real responses: three files across a nested namespace, one diff discussion,
 * one general note and one approval.
 */

export const MERGE_REQUEST_REF = { kind: 'gitlab-mr', host: 'gitlab.com', project: 'acme/platform/web', iid: '42' } as const

const API = 'https://gitlab.com/api/v4/projects/acme%2Fplatform%2Fweb/merge_requests/42'
const SHAS = { base_sha: 'b'.repeat(40), start_sha: 'c'.repeat(40), head_sha: 'a'.repeat(40) }

const ada = { id: 7, username: 'ada', name: 'Ada', avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/7/avatar.png' }
const bob = { id: 8, username: 'bob', name: 'Bob', avatar_url: 'https://gitlab.com/uploads/-/system/user/avatar/8/avatar.png' }

const mergeRequest = {
  iid: 42,
  title: 'Retry failed uploads',
  description: 'Uploads now retry three times.',
  state: 'opened',
  draft: false,
  author: ada,
  source_branch: 'feat/retry-uploads',
  target_branch: 'main',
  sha: SHAS.head_sha,
  diff_refs: SHAS,
  web_url: 'https://gitlab.com/acme/platform/web/-/merge_requests/42',
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-02T09:00:00.000Z',
  changes_count: '3',
}

const diffs = [
  { old_path: 'src/upload.ts', new_path: 'src/upload.ts', new_file: false, renamed_file: false, deleted_file: false, collapsed: false, too_large: false, diff: '@@ -1,3 +1,4 @@\n export function upload() {\n-  send()\n+  retry(send)\n+  log()\n }\n' },
  { old_path: 'src/upload.test.ts', new_path: 'src/upload.test.ts', new_file: true, renamed_file: false, deleted_file: false, collapsed: false, too_large: false, diff: '@@ -0,0 +1,2 @@\n+test(\'retries\', () => {})\n+test(\'gives up\', () => {})\n' },
  { old_path: 'README.md', new_path: 'docs/README.md', new_file: false, renamed_file: true, deleted_file: false, collapsed: false, too_large: false, diff: '@@ -1 +1 @@\n-# Web\n+# Web app\n' },
]

const rawDiff = [
  'diff --git a/src/upload.ts b/src/upload.ts',
  'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
  '--- a/src/upload.ts',
  '+++ b/src/upload.ts',
  '@@ -1,3 +1,4 @@',
  ' export function upload() {',
  '-  send()',
  '+  retry(send)',
  '+  log()',
  ' }',
  'diff --git a/src/upload.test.ts b/src/upload.test.ts',
  'new file mode 100644',
  'index 0000000000000000000000000000000000000000..3333333333333333333333333333333333333333',
  '--- /dev/null',
  '+++ b/src/upload.test.ts',
  '@@ -0,0 +1,2 @@',
  '+test(\'retries\', () => {})',
  '+test(\'gives up\', () => {})',
  'diff --git a/README.md b/docs/README.md',
  'similarity index 80%',
  'rename from README.md',
  'rename to docs/README.md',
  'index 4444444444444444444444444444444444444444..5555555555555555555555555555555555555555 100644',
  '--- a/README.md',
  '+++ b/docs/README.md',
  '@@ -1 +1 @@',
  '-# Web',
  '+# Web app',
  '',
].join('\n')

const commits = [
  { id: 'a'.repeat(40), message: 'test: cover the retry\n' },
  { id: 'd'.repeat(40), message: 'feat: retry failed uploads\n' },
]

function note(id: number, author: typeof ada, body: string, extra: object = {}) {
  return { id, type: null, body, author, created_at: `2026-10-02T0${id}:00:00.000Z`, updated_at: `2026-10-02T0${id}:00:00.000Z`, system: false, ...extra }
}

const discussions = [
  { id: 'sys', notes: [note(1, ada, 'added 1 commit', { system: true })] },
  {
    id: 'f00d',
    notes: [
      note(2, bob, 'Should this back off between tries?', { type: 'DiffNote', resolvable: true, resolved: false, position: { position_type: 'text', ...SHAS, old_path: 'src/upload.ts', new_path: 'src/upload.ts', old_line: null, new_line: 2 } }),
      note(3, ada, 'Good call, next push.', { type: 'DiffNote', resolvable: true, resolved: false }),
    ],
  },
  { id: 'beef', notes: [note(4, bob, 'Nice and small.')] },
]

const approvals = { approved_by: [{ user: bob, approved_at: '2026-10-02T08:00:00.000Z' }] }

/** `GET` responses by URL, as the app requests them (first pages only: nothing here needs a second). */
export const MERGE_REQUEST_RESPONSES: Record<string, unknown> = {
  [API]: mergeRequest,
  [`${API}/diffs?per_page=100&page=1`]: diffs,
  [`${API}/commits?per_page=100&page=1`]: commits,
  [`${API}/raw_diffs`]: rawDiff,
  [`${API}/discussions?per_page=100&page=1`]: discussions,
  [`${API}/approvals`]: approvals,
  [`${API}/notes?order_by=updated_at&sort=desc&per_page=100`]: [],
}

export const MERGE_REQUEST_API = API
export const MERGE_REQUEST_SHAS = SHAS
