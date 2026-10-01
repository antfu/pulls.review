import type { DiffsPayload } from './diff'
import * as v from 'valibot'

export const ProviderCapabilitiesSchema = v.object({
  supportsAuth: v.boolean(),
  supportsComments: v.boolean(), // true for github only - paste/local have no review lifecycle to talk to
  requiresNetwork: v.boolean(),
  supportsFullFileContent: v.boolean(), // whether a file's full content can be re-fetched at base/head refs (github only - paste has no live source)
})
export type ProviderCapabilities = v.InferOutput<typeof ProviderCapabilitiesSchema>

/**
 * Discriminated by `kind` so each provider only accepts params that make sense
 * for its source, so adding `local`'s (cwd/ref-range) shape later is a new variant,
 * not a reshape of a shared bag of optional fields.
 */
export const FetchDiffParamsSchema = v.variant('kind', [
  v.object({
    kind: v.literal('github-pr'),
    owner: v.string(),
    repo: v.string(),
    number: v.string(),
  }),
  v.object({
    kind: v.literal('patch-text'),
    text: v.string(), // raw unified-diff/patch text, e.g. `git diff > diff.patch` output
    title: v.optional(v.string()), // optional user-supplied title from the paste/upload form
  }),
])
export type FetchDiffParams = v.InferOutput<typeof FetchDiffParamsSchema>

export interface Provider {
  readonly id: 'github' | 'local' | 'paste'
  readonly capabilities: ProviderCapabilities
  fetchDiff: (params: FetchDiffParams, opts: { token?: string }) => Promise<DiffsPayload>
}
