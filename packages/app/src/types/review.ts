import * as v from 'valibot'

/**
 * Per-file "reviewed" mark, keyed by the file's `sha` (see FileChangeSchema) rather
 * than by path or PR, so if a PR gets new commits and a given file's `sha` is
 * unchanged, its reviewed mark survives; only files whose `sha` actually changed
 * lose their mark. Also lets review state outlive any single cached PR entry: the
 * same file content reviewed in one PR context still registers as reviewed if
 * referenced again (e.g. a rebase, or the same file touched in a later PR).
 */
export const FileReviewStateSchema = v.object({
  sha: v.string(), // primary key, same sha as FileChange.sha
  reviewedAt: v.number(), // epoch ms
})
export type FileReviewState = v.InferOutput<typeof FileReviewStateSchema>
