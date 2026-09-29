# Architecture & design decisions

pulls.review is a SPA (deployed at pulls.review) that renders a GitHub PR's diff at
`/gh/{owner}/{repo}/{number}` — or an arbitrary pasted/uploaded unified diff at
`/upload` — grouped and summarized for easier review, with a rule-based
fallback grouping when no LLM is configured. See `plans/` for the
phase-by-phase implementation plans; this doc is the standing contract those
plans (and any future work) MUST follow.

## Invariants

- Everything MUST run in the browser. There is no backend — no server routes,
  no OAuth client-secret exchange, no edge functions. Auth is a user-pasted
  GitHub PAT (optional for public repos); LLM access is a user-pasted key or
  gateway token. This rules out anything that needs a server to keep a secret.
- The app MUST build as a static SPA (`ssr: false`, `nuxt generate`) and
  deploy as static files, on Vercel. `vercel.json` carries a catch-all
  rewrite to Nuxt's `/200.html` fallback so the dynamic route
  `/gh/[owner]/[repo]/[number]` works on direct navigation/refresh, not just
  client-side routing after landing on `/`.
- Nuxt auto-imports MUST stay disabled (`imports: { autoImport: false }`,
  `components: false`). Every composable, component, and Nuxt utility
  (`useRoute`, `#imports`, etc.) is imported explicitly.
- Unit tests (Vitest) SHOULD be co-located with the source file they test
  (`foo.ts` + `foo.test.ts`) wherever possible. This applies to every pure
  module — `patch-parser`, analyze adapters, cache modules, provider
  normalizers — not just a "utils" subset. A top-level `tests/` directory is
  reserved for higher-level integration tests (multiple modules wired
  together, e.g. provider + adapter + cache end-to-end), not a dumping
  ground for what should be co-located unit tests.

## Data flow: Provider -> Analyze adapter -> Cache -> View

Two pluggable-adapter boundaries exist so that adding a data source or an
analysis strategy later never touches the view layer:

- **`Provider`** (`app/providers/`) fetches + normalizes a diff from some
  source into the canonical `DiffsPayload` shape, and declares its
  capabilities (`supportsAuth`, `supportsComments`, ...). `FetchDiffParams` is
  a discriminated union (by `kind`) so each provider only accepts params that
  make sense for its source. Implementations:
  - `github` — GitHub REST API (PR metadata + paginated file list/patches).
  - `paste` — accepts raw unified-diff/patch text (pasted, or an uploaded
    `.diff`/`.patch` file, e.g. GitHub's `.diff` endpoint or `git diff >
    diff.patch` output) via the shared `app/patch-parser/`. Fed to the
    `/upload` route (no param) via a fixed `sessionStorage` key, not a URL —
    deliberately not shareable as a link, since it has no live source to
    refetch even if it were content-hash-addressed.
  - `local` (CLI-driven, diffing a working tree/commit range) is planned but
    deferred — it will reuse the same `patch-parser` `paste` already uses.
- **`app/patch-parser/`** parses unified-diff / git-extended-diff text (the
  format shared by GitHub's `.diff` endpoint, `git diff` output, and plain
  `diff -u`) into canonical `FileChange[]`. It is provider-agnostic
  infrastructure, not itself a provider: `github`'s normalizer falls back to
  it only for files whose `patch` GitHub's JSON API omitted (very large
  diffs); `paste` uses it as its only parsing path; `local` will too.
- **`AnalyzeAdapter`** (`app/analyze/`) turns a `DiffsPayload` into a
  `GroupedResult` (grouped files + optional summaries). Each
  adapter lives in its own folder (`app/analyze/adapters/{id}/index.ts`):
  - `none` — implemented. A single flat group containing every file, for
    users who just want the plain file list with no classification.
  - `rule-based` — implemented. Deterministic glob-pattern classification,
    flat (1-level) groups, no LLM, no network call.
  - `llm` — implemented. A pi-agent-core tool loop against whichever
    provider is selected in Settings (AI Gateway, Anthropic, or
    OpenAI-compatible — only the selected one is ever called). The prompt
    carries a file manifest (plus the full diffs when small); the model pulls
    diffs on demand with `read_diffs` and finishes with `submit_grouping`,
    whose coverage check rejects a grouping that misses or invents paths so
    the model must fix it. A read budget and a turn cap bound the run, and
    progress (`Reading 4 files: …`) streams to the header. Failures MUST
    surface as `llm.error` — there is no silent `rule-based` fallback, and
    nothing but real model output is ever stored under `llm`. Everything that
    runs or chats with a model - `stores/llm-store.ts` (the `DiffsStore.llm`
    sub-store), `composables/useLlmChat.ts`, the chat components, and the pi
    runtime (`agent.ts`, `runtime.ts`, `chat.ts`) behind them - is only
    reached via dynamic `import()` behind the compile-time
    `import.meta.env.PR_LLM` flag: the site builds with it on (lazy chunks),
    the embed with it off (the `import()`s are dead code, so its single IIFE
    never bundles any of it, nor `@ai-sdk/gateway`), and
    `vite.config.embed.ts` fails the build if an LLM SDK slips in anyway.
    `store.llm` is `undefined` iff the flag is off.
  - Follow-up chat reuses the analysis transcript: `llmSession` (`messages`
    + `chatStartIndex`) is persisted alongside the result in the `pr:*`
    entry, and `composables/useLlmChat.ts` builds a fresh pi `Agent` from it
    per message (`read_diffs` plus `update_grouping`, which replaces
    `analyzedBy.llm` in store and cache). Re-analyze or loading a shared
    result replaces the session; a refetch keeps it (the transcript still
    reads the live diff). Results cached without one show `Re-analyze to
    enable chat`.
  - `web-llm` — TODO, stub only. Fully in-browser model inference, no network
    call at analyze time.
  - LLM-sourced groups MAY nest one level (root group -> children, e.g.
    `docs/featureA`); `rule-based` groups MUST stay flat. Depth is capped at 2
    total — enforced structurally in the schema (child groups have no further
    `children`), not by convention.
  - A `GroupedResult` references files by path and MAY predate the diff it is
    viewed with (new commits since an AI run, a shared result, a model that
    omitted files). `resolveGroups` (`app/components/diff/group-utils.ts`)
    reconciles the two at view time and MUST NOT silently drop anything: a
    path still in the diff resolves to its `FileChange` (a renamed file is
    found by its `previousPath` too), a path that left the diff is kept as
    `missing` and rendered as removed, and files no group names are collected
    into a trailing `Uncategorized` group. Adapters therefore don't need their
    own catch-all group.
- **View components** (`app/components/`) MUST stay pure and data-driven: they
  receive a single `DiffsStore` (`app/stores/types.ts`) as a `store` prop,
  threaded explicitly down the tree (no provide/inject, no global singleton
  registry), and call its methods directly (`store.toggleReviewed(...)`,
  `store.llm?.reanalyze()`) instead of emitting events that bubble up to
  whoever created the store. `store.llm` is `undefined` when LLM analysis
  isn't compiled into the current build (`PR_LLM` off: the GitHub-embedded view),
  which components use structurally to hide the *run* side of AI (analyze,
  chat). The AI *result* itself (`store.aiResult`, `analyzeMode`) lives on the
  store root, because the embed can still hold one loaded from a shared PR
  comment (below). Components MUST
  NOT know which provider or analyze adapter produced the store's data, and
  MUST NOT talk to storage/providers/adapters directly — only the store
  factories (`app/stores/diffs-store.ts`'s `createDiffsStore`,
  `app/stores/mock-diffs-store.ts`'s `createMockDiffsStore`) do that. This
  keeps every view component Storybook-friendly and isomorphic across a real
  PR, a pasted patch, and mock data — a story just builds a different store.

## Sharing an AI result through the PR (`plans/07-share-result.md`)

An `llm`/`web-llm` `GroupedResult` MAY be posted as a Conversation (issue)
comment on the GitHub PR, one comment per user, updated in place on later
shares. This is the only way the github.com embed gets an AI result at all
(GitHub's CSP blocks model providers), and lets token-less visitors on public
repos read one. Contract:

- Body: line 1 is the literal marker `<!-- pulls.review data -->`; then a link
  to `https://pulls.review/gh/{owner}/{repo}/{n}?from={login}` (hardcoded
  origin — a preview host MUST NOT leak into a public comment); then a
  `<details>` with model/time/head attribution and a fenced ```` ```json ````
  block `{ headSha, result }` (`SharedAnalysisSchema`). Exact template in
  `plans/07-share-result.md`. Unmarked or invalid comments are ignored, never an
  error. Only the `GroupedResult` is shared — never the chat transcript.
- Loading writes the result into the `pr:*` entry under its own `source` with
  `sharedBy: login`, so the view credits it and never offers to re-share it.
  Discovery is one best-effort `GET` of the first 100 comments, run only when
  the store has no AI result. `?from=` on the site loads that user directly
  unless it would replace a locally generated result (then it's offered).
- A shared result whose `headSha` differs from the loaded diff is offered
  labelled outdated, not hidden.

## Canonical data structures

All canonical shapes (`DiffsPayload`, `GroupedResult`, `PrCacheEntry`,
`FileReviewState`, ...) are defined as `valibot` schemas first, with the TS
type derived via `v.InferOutput`. Runtime validation happens at the two
boundaries that see untrusted/versioned data: normalizing a provider's raw
API response, and reading an entry back out of storage.

Every `FileChange` carries a `sha` — the provider's content-addressed hash
for that file: GitHub's blob SHA (from the JSON API, or extracted from a
parsed patch's `index <old>..<new>` line — git-generated diffs carry real
blob shas even as plain text), falling back to a computed SHA-256 hash of the
patch content only when no such line exists (e.g. a plain POSIX `diff -u`
paste). This is the key primitive that lets the app tell whether a file
actually changed between two fetches of the same PR without diffing patch
text, and is also the key for persisted review state (see below).

## Caching (unstorage, IndexedDB driver)

Persistence goes through [`unstorage`](https://github.com/unjs/unstorage), not
raw IndexedDB calls, specifically so the backend can be swapped later (e.g. a
future sync/remote layer) without touching `pr-cache.ts`/`review-cache.ts`
call sites — the same swappable-adapter shape as `Provider`/`AnalyzeAdapter`.
Runtime uses the `indexedDB` driver; tests use the `memory` driver against
identical code, no separate IndexedDB-mocking dependency needed.

One `unstorage` instance, three logical collections via key prefix (unstorage
is flat key-value, so there's no native "object store" split):

- `pr:*` — raw diff + the `llm`/`web-llm` `GroupedResult`s (+ the `llmSession`
  chat transcript, counted toward the size budget), keyed by
  `pr:{provider}:{owner}/{repo}#{number}` for github or `pr:paste:{contentHash}`
  for paste (content hash is an internal cache key only, never exposed in a
  URL — see the `paste` provider note above). App-managed LRU eviction
  (size/count budget), not left to browser eviction heuristics. For `github`,
  staleness is detected by comparing cached vs. live `headSha` and surfaced
  as a non-intrusive refresh banner — the app MUST NOT silently auto-refetch
  (that could re-trigger a paid LLM analysis) or silently go stale. `paste`
  entries have no live source, so no staleness check applies; if evicted,
  `/upload` simply has nothing to show until the user pastes again.
  Only results that cost a model call are persisted: `rule-based` and `none`
  MUST be recomputed from the diff on every load, so they can never disagree
  with it. A refetch replaces the entry's diff but keeps its AI result and
  session — `resolveGroups` reconciles them against the new diff, so a paid
  analysis is never thrown away by new commits.
- `review:*` — per-file "reviewed" marks, keyed by `review:{FileChange.sha}`,
  not by path or PR. This is deliberate: if a PR gets new commits and a
  file's `sha` is unchanged, its reviewed mark MUST survive; only files whose
  `sha` changed lose their mark. Pruned opportunistically whenever `pr:*`
  evicts, by walking the remaining entries' shas.
- `file-content:*` — a file's full raw content at a specific ref, fetched
  on demand from `FileDiff.vue`'s "load full file" action (github only -
  gated behind `ProviderCapabilities.supportsFullFileContent`), keyed by
  `file-content:{ref sha}:{path}`. `ref` is the PR's base/head **commit**
  sha, not a per-blob sha - equally content-addressed for caching purposes,
  without a separate request to look one up. No eviction of its own yet
  (unlike `pr:*`/`review:*`), a known gap for later.

## Explicitly out of scope for now

These are deferred, not rejected — the abstractions above exist so they can
land later without a rewrite:

- `web-llm` analyze adapter (stub only).
- Merging PRs. (Review comment threads and formal review submission are
  built — see `plans/05-comment-threads.md` — gated behind
  `Provider.capabilities.supportsComments`, true for `github` only.)
- `local` CLI provider.
- Any landing/history dashboard (deep-links only: `/gh/owner/repo/number` and
  nothing else) or social/OG link previews (no backend to render them).
- A compact "embed" layout mode (`?embed`), for the userscript below to
  render sanely inside a narrow drawer instead of the full page chrome. Not
  built yet - the app MUST NOT gain anything that forecloses it, no
  restrictive `X-Frame-Options`/`frame-ancestors`.
- A VS Code extension ("devframe", à la the official GitHub Pull Requests and
  Issues extension) surfacing pulls.review inside the editor for the local
  working-tree diff or the PR matching the checked-out branch. Depends on
  the `local` provider; not built yet.

## UI conventions

- Settings (GitHub PAT, later model keys) and loading a pasted/uploaded diff
  are both modals/panels (`SettingsModal.vue`/`LoadDiffModal.vue` wrapping
  pure `*Panel.vue` content), triggered from `AppHeader.vue` — never routed
  pages. `AppHeader` itself only renders on `pages/index.vue` (the `/gh/...`
  and `/upload` reading views stay header-free; their own sticky
  `DiffsHeader` is the only scroll nav there).
- A userscript (`userscript/diffs-github.user.js`) embeds a pulls.review drawer
  directly into `github.com` pull request pages via an iframe pointing at
  the matching `/gh/owner/repo/number?embed` - styled with inline styles
  only, since it can't ship a stylesheet into someone else's page.
- Diff layout (split/unified) is user-toggleable; both are supported by
  `@pierre/diffs`.
- Large PRs are a first-class case, not an edge case: file lists and diff
  content MUST be virtualized (`@tanstack/vue-virtual`).
- Every component in `app/components/` gets a Storybook story, backed by a
  mix of real captured fixtures (provider + rule-based adapter output on real
  PRs) and hand-authored synthetic fixtures for edge cases.
