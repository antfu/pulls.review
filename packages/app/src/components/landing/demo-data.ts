import type { DiffCategory } from '@pulls.review/core'

/**
 * The pull request the landing-page animation walks through: antfu/pulls.review#9
 * with its real stats, its files bucketed into five groups whose stats add up to
 * the PR total.
 */

export interface DemoGroup {
  /** Message key under `landing.demoGroups`; the label is translated at render time. */
  key: 'store' | 'ui' | 'refactor' | 'tests' | 'docs'
  category: DiffCategory
  additions: number
  deletions: number
  files: number
  /** Show this group's files once grouped; the others stay a single header row. */
  expanded?: boolean
}

export interface DemoFile {
  path: string
  /** Index into {@link DEMO_GROUPS}: where the row flies to. */
  group: number
}

/** antfu/pulls.review#9; its title is `landing.demoTitle`, translated at render time. */
export const DEMO_PR = {
  number: 9,
  additions: 1358,
  deletions: 156,
  files: 37,
}

export const DEMO_GROUPS: DemoGroup[] = [
  { key: 'store', category: 'api', additions: 363, deletions: 3, files: 8, expanded: true },
  { key: 'ui', category: 'ui', additions: 331, deletions: 31, files: 11, expanded: true },
  { key: 'refactor', category: 'core', additions: 182, deletions: 77, files: 9, expanded: true },
  { key: 'tests', category: 'tests', additions: 353, deletions: 1, files: 4 },
  { key: 'docs', category: 'docs', additions: 129, deletions: 44, files: 5 },
]

/** The rows shown in the flat state; the rest hide behind "N more files". */
export const DEMO_FILES: DemoFile[] = [
  { path: 'app/stores/shared-analysis-store.ts', group: 0 },
  { path: 'app/components/diff/ShareResultModal.vue', group: 1 },
  { path: '.agents/01-architecture.md', group: 4 },
  { path: 'app/providers/github/shared-analysis-comment.ts', group: 0 },
  { path: 'app/stores/diffs-store.ts', group: 2 },
  { path: 'app/stores/diffs-store.test.ts', group: 3 },
  { path: 'app/stores/shared-analysis-store.test.ts', group: 3 },
  { path: 'pnpm-lock.yaml', group: 4 },
  { path: 'app/components/diff/DiffsHeader.vue', group: 1 },
  { path: 'app/cache/pr-cache.ts', group: 0 },
  { path: 'test/fixtures/shared-analysis/comment.json', group: 3 },
  { path: 'app/stores/reviews-store.ts', group: 2 },
  { path: 'app/components/diff/share-result.css', group: 1 },
  { path: 'plans/07-share-result.md', group: 4 },
  { path: 'plans/04-local-provider.md', group: 4 },
]
