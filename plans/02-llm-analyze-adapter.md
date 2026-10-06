# Plan 02: LLM analyze adapter

## Scope

Implement `app/analyze/adapters/llm/index.ts`, currently a stub that throws
`'llm adapter not implemented yet'`. Fits into the existing `AnalyzeAdapter`
registry (`app/analyze/index.ts`); no changes needed to the registry itself
or to view components, which already render `summary`/`overallSummary`
conditionally.

## Approach

- Use the Vercel AI SDK, preferring the AI Gateway (a single gateway token in
  Settings) with a direct OpenAI-compatible or Anthropic key as fallback.
- Input: `PullRequestDiff`. Output: `GroupedResult` matching
  `app/types/analyze.ts` exactly, including `schemaVersion` and
  `generatedAt`.
- Groups may nest one level (root group with `children`), unlike
  `rule-based`'s flat groups. Depth is capped at 2 total, already enforced by
  the schema (`DiffGroupLeafSchema` has no `children` field).
- Populate `overallSummary` and per-group `summary`. These fields are
  optional in the schema specifically for this adapter; keep them present
  here since it is the adapter meant to populate them.
- `available` flips to `true` once a key or gateway token is configured in
  Settings; wire that check through `useSettings.ts`.
- Large diffs must not blow the model's context: chunk by file/group rather
  than sending the full unified diff text in one prompt where the diff is
  large. Decide the chunking threshold empirically against a couple of real
  large PRs.

## Settings

- Add a "Model Providers" section to `SettingsPanel.vue` (the plan for phase
  1 already left this an explicit placeholder). Fields: gateway token, or
  per-vendor key. Same `localStorage` storage pattern as the GitHub PAT, not
  IndexedDB.

## Testing

- Co-located `index.test.ts`: mock the AI SDK call, assert the adapter maps
  a model response into a schema-valid `GroupedResult`, and that malformed
  model output is rejected/falls back rather than crashing the view layer
  (`v.parse` against `GroupedResultSchema`).
- Manual test against 1-2 real PRs (small and large) with a real key.

## Out of scope

- `web-llm` (fully in-browser inference) is a separate adapter; see
  [`03-web-llm-analyze-adapter.md`](./03-web-llm-analyze-adapter.md).
- Comment threads/review actions; see
  [`05-comment-threads.md`](./05-comment-threads.md).
