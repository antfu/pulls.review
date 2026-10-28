import type { GroupedResult } from '../types/analyze'
import type { DiffsPayload, FileChange } from '../types/diff'

export interface EvalCase {
  name: string
  diff: DiffsPayload
  expected: GroupedResult
}

function file(path: string, patch: string): FileChange {
  return {
    path,
    status: 'modified',
    additions: 3,
    deletions: 1,
    isBinary: false,
    sha: path,
    hunks: [{ header: '@@ -1,3 +1,4 @@', oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, patch }],
  }
}

function expected(groups: GroupedResult['groups']): GroupedResult {
  return { source: 'llm', generatedAt: '2026-10-28T12:00:00.000Z', schemaVersion: 1, groups }
}

/**
 * Golden grouping corpus: small synthetic PRs with hand-authored expected
 * groupings. Grow it from real feedback (`analysis_feedback`) - a case earns
 * its place by catching a grouping regression a prompt/model change caused.
 */
export const EVAL_CORPUS: EvalCase[] = [
  {
    name: 'feature-with-tests',
    diff: {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
      title: 'Add CSV export',
      files: [
        file('src/export/csv.ts', '+export function toCsv(rows) {}'),
        file('src/export/download.ts', '+export function downloadCsv() {}'),
        file('src/export/csv.test.ts', '+test("csv", () => {})'),
        file('docs/export.md', '+# Export'),
      ],
    },
    expected: expected([
      { key: 'csv-export', label: 'CSV export', category: 'core', filePaths: ['src/export/csv.ts', 'src/export/download.ts'] },
      { key: 'tests', label: 'Tests', category: 'tests', filePaths: ['src/export/csv.test.ts'] },
      { key: 'docs', label: 'Docs', category: 'docs', filePaths: ['docs/export.md'] },
    ]),
  },
  {
    name: 'critical-auth-change',
    diff: {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '2' },
      title: 'Rotate session tokens',
      files: [
        file('src/auth/session.ts', '+rotateOnRefresh()'),
        file('src/auth/cookies.ts', '+httpOnly: true'),
        file('src/ui/login-button.vue', '+<button>Sign in</button>'),
      ],
    },
    expected: expected([
      { key: 'auth', label: 'Auth', category: 'security', critical: true, filePaths: ['src/auth/session.ts', 'src/auth/cookies.ts'] },
      { key: 'ui', label: 'Login UI', category: 'ui', filePaths: ['src/ui/login-button.vue'] },
    ]),
  },
  {
    name: 'mechanical-and-feature',
    diff: {
      ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '3' },
      title: 'Dark mode toggle + dependency bumps',
      files: [
        file('src/theme/dark.ts', '+export const isDark = ref(false)'),
        file('src/theme/toggle.vue', '+<button @click="toggle" />'),
        file('pnpm-lock.yaml', '+lockfileVersion'),
        file('package.json', '+"vue": "^3.5.0"'),
      ],
    },
    expected: expected([
      { key: 'dark-mode', label: 'Dark mode', category: 'ui', filePaths: ['src/theme/dark.ts', 'src/theme/toggle.vue'] },
      { key: 'deps', label: 'Dependencies', category: 'deps', filePaths: ['pnpm-lock.yaml', 'package.json'] },
    ]),
  },
]
