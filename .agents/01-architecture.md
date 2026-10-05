# Architecture & design decisions

pulls.review is a SPA (deployed at pulls.review) that renders a GitHub PR's diff at
`/gh/{owner}/{repo}/{number}` — or an arbitrary pasted/uploaded unified diff at
`/upload` — grouped and summarized for easier review, with a rule-based
fallback grouping when no LLM is configured. `/gh/{owner}/{repo}` lists the
repo's open PRs as a way into those deep-links. See `plans/` for the
phase-by-phase implementation plans; this doc is the standing contract those
plans (and any future work) MUST follow.

## Layout

A pnpm workspace of three packages (`plans/08-core-and-cli.md`):

- `packages/app` — the SPA and the github.com embed (Vite + Vue). Paths
  below written as `app/…` live in `packages/app/src/`.
- `packages/core` (`@pulls.review/core`) — everything runtime-agnostic,
  exposed as subpaths rather than one barrel: `/types`, `/patch-parser`,
  `/github`, `/paste`, `/cache` (persistence repositories), `/analyze` (rule-based/none adapters, LLM settings and
  model resolution), `/llm` (the agent runtime and SDKs), `/diagnostics`,
  `/locales`. Built with tsdown; the app resolves `@pulls.review/core/*` to
  source through a Vite alias. Core MUST load
  under plain Node: no Settings, vue-i18n, `localStorage`, `document`, or
  Vite-only syntax (`import.meta.glob`, `import.meta.env`) inside it.
  Callers pass model settings and locale in, inject group text, word the
  structured progress events, and translate nostics diagnostics by code.
- `packages/actions` (`@pulls.review/actions`) — the GitHub Actions CLI: fetch,
  analyze, upsert the shared-analysis comment; what the root `action.yml`
  composite action runs.
- `packages/cli` (`pulls.review`, the unscoped name) is reserved for the
  standalone CLI: local git review served through devframe
  (`plans/09-devframe-local-review.md`, on Plan 04's `local` source). It is not
  built yet and MUST NOT take over the Actions entry point.

## Invariants

- Nothing is proxied through a server we run. There is no backend — no server
  routes, no OAuth client-secret exchange, no edge functions. Auth is a
  user-supplied GitHub token (optional for public repos); LLM access is a
  user-supplied key or gateway token. This rules out anything that needs a
  server to keep a secret. The site does everything in the browser; the CLI
  does the same work in the user's own CI with the user's own secrets.
- The app MUST build as a static SPA and deploy as static files, on Vercel.
  `vercel.json` carries a catch-all rewrite to `/index.html` so the dynamic
  routes under `/gh/...` work on direct navigation/refresh, not
  just client-side routing after landing on `/`.
- Every composable, component and utility is imported explicitly — no
  auto-import plugin.
- Unit tests (Vitest) SHOULD be co-located with the source file they test
  (`foo.ts` + `foo.test.ts`) wherever possible. This applies to every pure
  module — `patch-parser`, analyze adapters, cache modules, provider
  normalizers — not just a "utils" subset. A top-level `tests/` directory is
  reserved for higher-level integration tests (multiple modules wired
  together, e.g. provider + adapter + cache end-to-end), not a dumping
  ground for what should be co-located unit tests.

## Data flow: DiffSource -> Analyze adapter -> Cache -> View

Two pluggable-adapter boundaries exist so that adding a data source or an
analysis strategy later never touches the view layer:

- **`DiffSource`** (`core/types/source.ts`) is one diff's origin, already bound
  to its target and `Credentials`: `key()` (the cache key, known before any
  fetch), `fetch()` (normalized into the canonical `DiffsPayload`), and optional
  capability members - `fingerprint()` for staleness, `loadFile()` for full file
  content, `viewer()` for who the credentials act as, and the framework-free
  `reviews: ReviewsApi` / `sharing: SharingApi` for review threads and shared
  analyses (the app's sub-stores only wrap them; a refused write surfaces as
  the `writeForbidden` diagnostic). `createDiffsStore(source, ...)` has one
  load path and derives what it offers from those members, never from which
  kind of source it holds. Every payload carries a structured `ref`
  (`SourceRef`, a valibot variant by `kind`); `serializeRef(ref)` is the only
  key formula, and nothing parses ids back. Views render a diff's header from
  neutral payload fields (`label`, `url`, `author`) and store flags
  (`canRefresh` from `fingerprint`, `auth` from the source), and link through
  `app/source-routes.ts` - the only module that maps refs to routes and back -
  so no component checks a ref's `kind` or spells out a `/gh/...` path. `Credentials.githubToken()` is read
  per request, so a token saved later applies without rebuilding a store.
  Implementations (`core/providers/`):
  - `github-pr` (`createGithubPullRequestSource`) — GitHub REST API (PR
    metadata + paginated file list/patches) through one `GithubClient`.
  - `github-compare` / `github-commit` (`createGithubCompareSource`,
    `createGithubCommitSource`) — `base...head` against its merge base, and one
    commit against its first parent. GitHub caps both listings at 300 files.
    A compare fingerprints by its head ref; a commit never changes, so it has
    no fingerprint. Neither has reviews or sharing. `createGithubSource(ref)`
    picks the right one for any GitHub ref, served at
    `/gh/{owner}/{repo}/compare/{base}...{head}` and
    `/gh/{owner}/{repo}/commit/{sha}` by the same page as a PR.
  - `paste` (`createPasteSource`) — accepts raw unified-diff/patch text (pasted, or an uploaded
    `.diff`/`.patch` file, e.g. GitHub's `.diff` endpoint or `git diff >
    diff.patch` output) via the shared `app/patch-parser/`. Fed to the
    `/upload` route (no param) via a fixed `sessionStorage` key, not a URL —
    deliberately not shareable as a link, since it has no live source to
    refetch even if it were content-hash-addressed.
  - `local` (`createLocalSource`, `plans/04-local-provider.md`) — a working
    tree, commit or range of a git repo, by running `git` with pinned diff
    flags and reusing the same `patch-parser` `paste` already uses. It lives in
    the Node-only `core/local` subpath, which the browser bundle MUST NOT import.
    A patch over 512 KB keeps its counts as `FileChange.truncated`. Plan 09
    serves it to the browser.
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
    provider the caller resolved (`resolveModel(llm)`: AI Gateway, Anthropic,
    or OpenAI-compatible — only the selected one is ever called). Core's
    `runLlmAnalysis(diff, resolved, locale)` knows nothing of Settings; the
    app binds it to `settings.value` in `app/analyze/adapters/llm/index.ts`. The prompt
    carries a file manifest, the commit subject lines when there is more than
    one commit, and the full diffs when they are small; the model pulls
    diffs on demand with `read_diffs` and finishes with `submit_grouping`,
    whose coverage check rejects a grouping that misses or invents paths so
    the model must fix it. The prompt itself stays English whatever the
    user's language; only its closing line (`Respond and categorize in
    <language>.`) names the locale, and the result is stamped with
    that `locale` so the view knows what language it is in. A read budget and a turn cap bound the run, and
    structured progress (`{ kind: 'reading', paths }`) streams to the header,
    worded by `app/i18n/core-messages.ts`. Failures MUST
    surface as `llm.error` — there is no silent `rule-based` fallback, and
    nothing but real model output is ever stored under `llm`. Everything that
    runs or chats with a model - `stores/llm-store.ts` (the `DiffsStore.llm`
    sub-store), `composables/useLlmChat.ts`, the chat components, and the pi
    runtime (`@pulls.review/core/llm`) behind them - is only
    reached via dynamic `import()` behind the compile-time
    `import.meta.env.PR_LLM` flag: the site builds with it on (lazy chunks),
    the embed with it off (the `import()`s are dead code, so its single IIFE
    never bundles any of it, nor `@ai-sdk/gateway`), and
    `vite.config.embed.ts` fails the build if an LLM SDK slips in anyway.
    `store.llm` is `undefined` iff the flag is off.
  - Follow-up chat reuses the analysis transcript: `llmSession` (`messages`
    + `chatStartIndex`) is persisted alongside the result in the cached diff
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
  registry), and call its methods directly (`store.setReviewed(...)`,
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
- Loading writes the result into the cached diff under its own `source` with
  `sharedBy: login`, so the view credits it and never offers to re-share it.
  Discovery is one best-effort `GET` of the first 100 comments, run only when
  the store has no AI result. `?from=` on the site loads that user directly
  unless it would replace a locally generated result (then it's offered).
- A shared result whose `headSha` differs from the loaded diff is offered
  labelled outdated, not hidden. Likewise one whose `locale` differs from the
  UI language is offered labelled with that language (results from before the
  field existed are treated as matching). Sharing a non-English result shows a
  banner recommending English for public projects; the confirm button reads
  `Share anyway`.

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

## Caching (`@pulls.review/core/cache`, unstorage)

Persistence is a set of repositories in core (`DiffCache`, `ReviewMarks`,
`FileContentCache`, `PullRequestListCache`, built together by
`createCacheRepositories(storage)`) over any
[`unstorage`](https://github.com/unjs/unstorage) `Storage`, so the backend can
be swapped (IndexedDB in the browser, `memory` in tests, a server-side driver
later) without touching a call site. The app builds its repositories once, in
the app context (`app/app-context.ts`, IndexedDB via `app/cache/browser-cache.ts`),
installed once per app (the SPA, the embed's custom element): pages and
top-level composables inject it and pass it to store factories as `cache`;
there is no module singleton.

One `unstorage` instance, logical collections via key prefix (unstorage is
flat key-value, so there's no native "object store" split):

- `pr-meta:*` + `pr-body:*` — one cached diff, split in two documents under the
  same key. The meta half holds what eviction, the recent lists and per-view
  bookkeeping need (`headSha`, title, counts, file shas, `lastViewedAt`, size,
  shared comment, `changedSinceReviewed`), so none of them reads a whole diff;
  the body holds the raw diff, the `llm`/`web-llm` `GroupedResult`s, the review
  snapshot and the `llmSession` chat transcript (counted toward the size
  budget). Keyed by the diff's id, `github:{owner}/{repo}#{number}` for github
  or `paste:{contentHash}` for paste (content hash is an internal cache key
  only, never exposed in a URL — see the `paste` provider note above). Writes
  to one key run one at a time inside `DiffCache`, so overlapping
  read-modify-writes never drop each other's changes. Entries from before the
  split (`pr:*`) are deleted on the next eviction pass. App-managed LRU eviction
  (size/count budget), not left to browser eviction heuristics. For `github`,
  staleness is detected by comparing cached vs. live `headSha` and surfaced as
  a non-intrusive refresh banner, unless the user opted into auto-refresh
  (banner checkbox or Settings) — the app MUST NOT re-run a paid LLM analysis
  on refetch, and MUST NOT silently go stale. `paste` entries have no live
  source, so no staleness check applies; if evicted, `/upload` simply has
  nothing to show until the user pastes again.
  Only results that cost a model call are persisted: `rule-based` and `none`
  MUST be recomputed from the diff on every load, so they can never disagree
  with it. A refetch replaces the entry's diff but keeps its AI result and
  session — `resolveGroups` reconciles them against the new diff, so a paid
  analysis is never thrown away by new commits.
- `review:*` — per-file "reviewed" marks, keyed by `review:{FileChange.sha}`,
  not by path or PR. This is deliberate: if a PR gets new commits and a
  file's `sha` is unchanged, its reviewed mark MUST survive; only files whose
  `sha` changed lose their mark. Pruned opportunistically whenever the diff cache
  evicts, by walking the remaining entries' shas. Which of those files *had*
  been reviewed is remembered on the cached diff as `changedSinceReviewed`
  (paths): `putDiff` flags every path whose outgoing `sha` carried a mark and
  whose incoming `sha` differs, and the flag survives further commits until
  the user marks the file again (`DiffsStore.setReviewed`), which is how the
  view shows "reviewed, but changed since" instead of plain "unreviewed".
- `file-content:*` — a file's full raw content at a specific ref, fetched
  on demand by `FileDiff.vue`'s "load full file" action through
  `DiffsStore.fileContent` (present only when the source has `loadFile`;
  github only today), keyed by `file-content:{diff key}:{ref sha}:{path}`.
  `ref` is the diff's base/head **commit** sha, not a per-blob sha - equally
  content-addressed for caching purposes, without a separate request to look
  one up; the diff key scopes it so a non-commit ref can't collide across
  sources. No eviction of its own yet
  (unlike the diff cache and review marks), a known gap for later.
- `pulls:*` — a repo's first page of open PRs (`PullRequestListPage`), keyed
  `pulls:{owner}/{repo}`. Stale-while-revalidate: it renders instantly on
  revisit and is silently replaced by a fresh first page every time — unlike
  a cached diff, nothing paid hangs off a list, so auto-refetching costs nothing.
  Later pages chain off it via `next` and are never persisted. Search is
  client-side (fzf over the loaded rows) and drains the remaining pages so
  its results cover the whole repo; only open/draft PRs are ever listed. With
  a token the rows come from GraphQL search (review decision, CI rollup,
  linked issues); without one, from REST search, which lacks those three.

## Explicitly out of scope for now

These are deferred, not rejected — the abstractions above exist so they can
land later without a rewrite:

- `web-llm` analyze adapter (stub only).
- Merging PRs. (Review comment threads and formal review submission are
  built — see `plans/05-comment-threads.md` — offered
  only for a source with `reviews`.)
- Any cross-repo/history dashboard (the per-repo open-PR list at
  `/gh/owner/repo` is a navigation aid into the deep-links, not that) or
  social/OG link previews (no backend to render them).
- The `pulls.review` devframe CLI (`plans/09-devframe-local-review.md`):
  local review served by the user's own process, a static snapshot, or a
  devframe hub dock. Depends on the `local` source; not built yet.

## UI conventions

- Every user-facing string goes through vue-i18n (`app/i18n/`): `$t()` in
  templates, `useI18n()` in component scripts, `i18n.global.t` in plain
  modules. Core has no vue-i18n: the app's adapter registry
  (`app/analyze/index.ts`) supplies the rule-based group text, and
  `app/i18n/core-messages.ts` words core's progress events and translates its
  nostics diagnostics by code (`localizeError`), falling back to the English
  message. English is bundled and is the key schema (`locales/en.json`, typed
  via `DefineLocaleMessage`); other locales load on demand. One
  `settings.locale` drives both the UI and the language the LLM writes
  summaries in; it is seeded from `navigator.languages` (core's `locales.ts`)
  and switched from the `LanguageMenu` icon in `NavControls`. Model-facing
  text (prompts, tool errors) and diagnostics that embed URLs/status codes
  stay English.
- Settings (GitHub PAT, later model keys) and loading a pasted/uploaded diff
  are both modals/panels (`SettingsModal.vue`/`LoadDiffModal.vue` wrapping
  pure `*Panel.vue` content), triggered from `AppHeader.vue` — never routed
  pages. `AppHeader` itself only renders on `pages/index.vue` (the `/gh/...`
  and `/upload` reading views stay header-free; their own sticky
  `DiffsHeader` is the only scroll nav there).
- A generated userscript (`scripts/build-userscript.ts`) mounts
  `<pulls-review-embed-panel>` (`app/embed/`, a Vue custom element built as
  one IIFE with `PR_EMBED` on and `PR_LLM` off) into `github.com` pull request
  pages. The PR view renders inside its shadow root with a pre-compiled
  stylesheet; `githubIntegration.ts` is the only code touching GitHub's own
  DOM - a "Review Changes" tab beside "Files changed" and the edge button,
  both dotted when a shared analysis exists for the PR; while open, the
  conversation sidebar is hidden and `<html>` shrinks to the remaining width
  so the page reflows beside the drawer; `https://pulls.review/gh/...` links
  to the current PR open in the drawer (honouring `?from=`), with an appended
  icon that still opens the site in a new tab.
- Diff layout (split/unified) is user-toggleable; both are supported by
  `@pierre/diffs`.
- The group list is user-toggleable between tabs in the sticky `DiffsHeader`
  and a sticky left sidebar tree (`DiffGroupSidebar`, subgroups nested under
  their parent). The sidebar only applies at `lg` and up; narrower viewports
  always get the tabs. Persisted like the diff layout (`state/group-nav.ts`).
- Large PRs are a first-class case, not an edge case: file lists and diff
  content MUST be virtualized (`@tanstack/vue-virtual`).
- Every component in `app/components/` gets a Storybook story, backed by a
  mix of real captured fixtures (provider + rule-based adapter output on real
  PRs) and hand-authored synthetic fixtures for edge cases.
