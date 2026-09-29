/**
 * The pull request the landing-page animation walks through. Modelled on
 * antfu/pulls.review#9 (title, groups, paths) with the stats scaled up so the
 * "long flat list becomes five groups" story lands at a glance.
 */

export interface DemoGroup {
  label: string
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

export const DEMO_PR = {
  number: 9,
  title: 'feat: share an AI analysis as a PR comment and load shared results',
  summary: 'One reviewer with an API key posts their analysis to the PR; everyone else, including the github.com embed, loads it without a token.',
  additions: 5356,
  deletions: 1244,
  files: 41,
}

export const DEMO_GROUPS: DemoGroup[] = [
  { label: 'Shared analysis store & comment contract', additions: 2418, deletions: 612, files: 14, expanded: true },
  { label: 'Share result UI', additions: 1203, deletions: 187, files: 9, expanded: true },
  { label: 'Store refactor: aiResult to root', additions: 842, deletions: 331, files: 7 },
  { label: 'Tests', additions: 731, deletions: 96, files: 8 },
  { label: 'Docs & deps', additions: 162, deletions: 18, files: 3 },
]

/** The rows shown in the flat state; the rest hide behind "N more files". */
export const DEMO_FILES: DemoFile[] = [
  { path: 'app/stores/shared-analysis-store.ts', group: 0 },
  { path: 'app/components/diff/ShareResultModal.vue', group: 1 },
  { path: '.agents/01-architecture.md', group: 4 },
  { path: 'app/providers/github/shared-analysis-comment.ts', group: 0 },
  { path: 'app/stores/diffs-store.ts', group: 2 },
  { path: 'app/components/diff/SharedAnalysisBanner.vue', group: 1 },
  { path: 'app/stores/shared-analysis-store.test.ts', group: 3 },
  { path: 'app/types/shared-analysis.ts', group: 0 },
  { path: 'pnpm-lock.yaml', group: 4 },
  { path: 'app/components/diff/DiffsHeader.vue', group: 1 },
  { path: 'app/cache/pr-cache.ts', group: 0 },
  { path: 'test/fixtures/shared-analysis/comment.json', group: 3 },
  { path: 'app/stores/reviews-store.ts', group: 2 },
  { path: 'app/components/diff/share-result.css', group: 1 },
  { path: 'plans/07-share-result.md', group: 4 },
  { path: 'app/stores/github-write-access.ts', group: 0 },
]
