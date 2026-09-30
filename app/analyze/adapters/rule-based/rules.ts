import type { DiffCategory } from '../../../types/analyze'

export interface GroupRule {
  key: string
  label: string
  /**
   * No LLM available: a plain, deterministic blurb rather than an empty summary
   * field, so the UI always has something to show above a group's file tree.
   */
  summary: string
  category: DiffCategory
  patterns?: string[]
}

/**
 * Generated/lockfile-style output - shared with `noisy-files.ts`, which collapses
 * these by default in the diff view, so the two "this file is noise" notions
 * (grouping rule vs. default-collapsed) can't drift apart.
 */
export const GENERATED_PATTERNS = [
  '**/*.generated.*',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/package-lock.json',
  '**/Cargo.lock',
  '**/go.sum',
  '**/dist/**',
  '**/*.lock',
]

/** Fallback for text files no pattern matches. */
export const codeRule: GroupRule = {
  key: 'code',
  label: 'Code',
  summary: 'Source changes.',
  category: 'core',
}

/**
 * Binary files (images, fonts, archives, ...) land here regardless of path -
 * path patterns only make sense for text files.
 */
export const otherRule: GroupRule = {
  key: 'other',
  label: 'Other',
  summary: 'Other changes that don\'t fit an existing category.',
  category: 'other',
}

/**
 * Evaluated in order, first match wins - more specific patterns (docs, tests) come
 * before more general catch-alls (config, generated) so e.g. a doc file under
 * `.github/` still lands in `docs`, not `config`. Rules without `patterns`
 * (`codeRule`, `otherRule`) are only reached as fallbacks; the order also sets group order.
 */
export const defaultRules: GroupRule[] = [
  {
    key: 'docs',
    label: 'Docs',
    summary: 'Documentation updates.',
    category: 'docs',
    patterns: [
      '**/*.md',
      '**/*.mdx',
      '**/*.mdc',
      '**/docs/**',
      '**/README*',
    ],
  },
  codeRule,
  {
    key: 'tests',
    label: 'Tests',
    summary: 'Test coverage for the change.',
    category: 'tests',
    patterns: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
    ],
  },
  {
    key: 'config',
    label: 'Config',
    summary: 'Configuration changes.',
    category: 'config',
    patterns: [
      '*.config.*',
      '.*rc',
      '.*rc.*',
      '.github/**',
      '.git*',
      '**/tsconfig*.json',
      '**/Dockerfile',
      '**/docker-compose*.y*ml',
      '**/.dockerignore',
      '**/Makefile',
    ],
  },
  // Manifests declare deps; their lockfiles are machine-generated output, not
  // something a reviewer edits by hand - see GENERATED_PATTERNS above.
  {
    key: 'deps',
    label: 'Dependencies',
    summary: 'Dependency version changes.',
    category: 'deps',
    patterns: [
      '**/package.json',
      '**/pnpm-workspace.yaml',
      '**/Cargo.toml',
      '**/go.mod',
    ],
  },
  {
    key: 'generated',
    label: 'Generated',
    summary: 'Generated or build output changes.',
    category: 'other',
    patterns: GENERATED_PATTERNS,
  },
  otherRule,
]
