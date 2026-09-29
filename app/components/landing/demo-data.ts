/**
 * The pull request the landing-page animation walks through. Modelled on
 * antfu/pulls.review#9 (title, groups, paths) with the stats scaled up so the
 * "long flat list becomes five groups" story lands at a glance.
 */

export interface DemoGroup {
  label: string
  summary: string
  additions: number
  deletions: number
  files: number
}

export interface DemoFile {
  path: string
  additions: number
  deletions: number
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
  {
    label: 'Shared analysis store & comment contract',
    summary: 'Marker, link and JSON payload in one issue comment; discovery of shared results.',
    additions: 2418,
    deletions: 612,
    files: 14,
  },
  {
    label: 'Share result UI',
    summary: 'Share button, confirm modal, and a banner listing who shared.',
    additions: 1203,
    deletions: 187,
    files: 9,
  },
  {
    label: 'Store refactor: aiResult to root',
    summary: 'Result and mode move out of store.llm so the embed can display them.',
    additions: 842,
    deletions: 331,
    files: 7,
  },
  {
    label: 'Tests',
    summary: 'Store, comment parsing and write-access gating covered.',
    additions: 731,
    deletions: 96,
    files: 8,
  },
  {
    label: 'Docs & deps',
    summary: 'Architecture notes and the share-result plan.',
    additions: 162,
    deletions: 18,
    files: 3,
  },
]

/** The rows shown in the flat state; the rest hide behind "N more files". */
export const DEMO_FILES: DemoFile[] = [
  { path: 'app/stores/shared-analysis-store.ts', additions: 870, deletions: 0, group: 0 },
  { path: 'app/providers/github/shared-analysis-comment.ts', additions: 412, deletions: 0, group: 0 },
  { path: 'app/components/diff/ShareResultModal.vue', additions: 290, deletions: 0, group: 1 },
  { path: 'app/components/diff/SharedAnalysisBanner.vue', additions: 145, deletions: 0, group: 1 },
  { path: 'app/components/diff/DiffsHeader.vue', additions: 121, deletions: 75, group: 1 },
  { path: 'app/stores/diffs-store.ts', additions: 260, deletions: 112, group: 2 },
  { path: 'app/stores/reviews-store.ts', additions: 54, deletions: 144, group: 2 },
  { path: 'app/stores/shared-analysis-store.test.ts', additions: 586, deletions: 0, group: 3 },
  { path: '.agents/01-architecture.md', additions: 127, deletions: 11, group: 4 },
  { path: 'plans/07-share-result.md', additions: 87, deletions: 0, group: 4 },
]
