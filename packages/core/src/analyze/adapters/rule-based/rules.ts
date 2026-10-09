import type { DiffCategory } from '../../../types/analyze'

export type RuleKey = 'docs' | 'code' | 'tests' | 'config' | 'deps' | 'generated' | 'other'

/**
 * The words a rule's group shows. Supplied by the caller (so the UI can translate
 * them) and resolved when the adapter runs, so the text follows the current language.
 * `summary` stands in for an LLM summary: a plain, deterministic blurb rather than an
 * empty field, so the UI always has something to show above a group's file tree.
 */
export interface RuleText {
  label: string
  summary: string
}

export interface GroupRule {
  key: RuleKey
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
  '**/drizzle/meta/**',
]

/** Fallback for text files no pattern matches. */
export const codeRule: GroupRule = {
  key: 'code',
  category: 'core',
}

/**
 * Binary files (images, fonts, archives, ...) land here regardless of path -
 * path patterns only make sense for text files.
 */
export const otherRule: GroupRule = {
  key: 'other',
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
    category: 'other',
    patterns: GENERATED_PATTERNS,
  },
  otherRule,
]
