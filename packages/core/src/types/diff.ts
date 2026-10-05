import * as v from 'valibot'
import { SourceRefSchema } from './source'

export const FileChangeStatusSchema = v.picklist(['added', 'removed', 'modified', 'renamed', 'copied'])
export type FileChangeStatus = v.InferOutput<typeof FileChangeStatusSchema>

export const DiffHunkSchema = v.object({
  header: v.string(), // e.g. "@@ -1,5 +1,6 @@"
  oldStart: v.number(),
  oldLines: v.number(),
  newStart: v.number(),
  newLines: v.number(),
  patch: v.string(), // raw hunk text, lines prefixed +/-/space
})
export type DiffHunk = v.InferOutput<typeof DiffHunkSchema>

export const FileChangeSchema = v.object({
  path: v.string(),
  previousPath: v.optional(v.string()), // for renames
  status: FileChangeStatusSchema,
  additions: v.number(),
  deletions: v.number(),
  isBinary: v.boolean(),
  // Content-addressed hash: the git blob sha when known, else a computed SHA-256
  // of the patch text. Lets the cache tell which files actually changed between
  // two fetches without diffing patch text. See app/patch-parser for the rules.
  sha: v.string(),
  hunks: v.array(DiffHunkSchema), // empty if binary
})
export type FileChange = v.InferOutput<typeof FileChangeSchema>

export const PullRequestStateSchema = v.picklist(['open', 'closed', 'merged', 'draft'])
export type PullRequestState = v.InferOutput<typeof PullRequestStateSchema>

/**
 * The genuinely PR-only extras - absent for paste/local, which have no review
 * lifecycle of their own. Nested under `DiffsPayload.pullRequest` rather than
 * flattened, so a payload with no `pullRequest` is unambiguously "not a PR".
 */
export const PullRequestMetaSchema = v.object({
  state: v.optional(PullRequestStateSchema),
})
export type PullRequestMeta = v.InferOutput<typeof PullRequestMetaSchema>

export const CommitSchema = v.object({
  sha: v.string(),
  message: v.string(), // full message; consumers pick the subject line themselves
})
export type Commit = v.InferOutput<typeof CommitSchema>

const RefSchema = v.object({
  sha: v.string(),
  ref: v.string(),
})

/**
 * Universal across sources (github, local diffs, pasted diffs) so the same
 * view components can render any of them without knowing which produced it.
 * Carries its own `files` directly - there is no separate "diff" wrapper type.
 */
export const DiffsPayloadSchema = v.object({
  ref: SourceRefSchema,
  title: v.string(), // "Pasted diff" default for paste, no PR title available
  /** Short identifier shown after the title and linked to `url`, e.g. `#123`. */
  label: v.optional(v.string()),
  author: v.optional(v.object({ name: v.string(), avatarUrl: v.optional(v.string()) })),
  description: v.optional(v.string()), // raw markdown body; absent for paste
  url: v.optional(v.string()), // permalink to source, absent for local/paste
  // base/head are only meaningful when the source actually has them (github
  // always does; a bare pasted patch usually doesn't unless a git diff
  // preamble is present, so these stay optional at the schema level).
  base: v.optional(RefSchema),
  head: v.optional(RefSchema),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  pullRequest: v.optional(PullRequestMetaSchema),
  commits: v.optional(v.array(CommitSchema)), // oldest first; absent when the source has no commit history
  files: v.array(FileChangeSchema),
})
export type DiffsPayload = v.InferOutput<typeof DiffsPayloadSchema>
