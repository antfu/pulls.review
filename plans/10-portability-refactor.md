# Plan 10: source- and storage-agnostic refactor

Status: **built** (#34-#38, #43-#45).

## Why

Local git review (Plan 04, and the devframe integration planned as Plan 09) needs
a diff source that is reached over RPC and a cache that lives on disk on the
server. The code today only knows two sources, a GitHub PR and a pasted patch,
and one storage backend, IndexedDB:

- `Provider` (`core/src/types/provider.ts`) is just `fetchDiff` plus four
  booleans, and nothing reads two of them. `createDiffsStore`
  (`app/src/stores/diffs-store.ts`) is an `if github-pr ... else paste` switch:
  its staleness check calls `fetchPullRequest` directly, it builds the cache key
  by hand, and only that switch decides whether the reviews and shared
  sub-stores exist.
- Views reach past the store. `FileDiff.vue` calls `fetchFileContentAtRef`, the
  cache and the settings token directly. `DiffsPage.vue` and `DiffsHeader.vue`
  check `provider === 'github'` and run `parseGithubDiffId`. Full-file context
  arrives through provide/inject (`file-content-context.ts`).
- Storage is a module singleton (`getDefaultCacheStorage`, 19 call sites), so
  store tests replace it with `vi.mock`. Eviction and the recent lists read every
  full diff on each write.
- GitHub access is spread out: three request helpers, two copies of
  `fetchAllPages`, five copies of the API base URL, and a token passed as an
  argument to every function.

This plan reshapes those seams one step at a time before any devframe code lands.
Then GitHub compare/commit, local git and a read-only snapshot each become one
more implementation of an interface that already exists.

## Target shape

### Sources (core)

- **`SourceRef`** is a valibot variant identifying one diff:
  `{ kind: 'github-pr', owner, repo, number }`,
  `{ kind: 'github-compare', owner, repo, base, head }`,
  `{ kind: 'github-commit', owner, repo, sha }` and `{ kind: 'paste', hash }`.
  `local` comes later. It is stored as `DiffsPayload.ref`.
  - `DiffsPayload.provider` and `DiffsPayload.id` are **deleted**.
  - `serializeRef(ref)` is the only key formula; nothing parses id strings.
- **`DiffSource`** is returned by `resolveSource(ref, { credentials })`, already
  bound to its target and credentials. Optional members replace the capability
  booleans:

  | Member                  | Meaning                                                                     |
  | ----------------------- | --------------------------------------------------------------------------- |
  | `ref`, `key`            | Identity and cache key, known before any fetch.                             |
  | `fetch()`               | Returns the `DiffsPayload`.                                                 |
  | `fingerprint?()`        | Cheap staleness probe (PR head sha today). Absent means no staleness check. |
  | `loadFile?(path, side)` | Full file content at base/head. Absent means no "load full file".           |
  | `reviews?: ReviewsApi`  | Framework-free review threads and submission API. GitHub PR only today.     |
  | `sharing?: SharingApi`  | Shared-analysis comment discovery and upsert. GitHub PR only today.         |
  | `auth?`                 | The credential the source can recover from (drives the token-recovery UI).  |

- Implementations live in core so the app, the CLI and the future devframe
  server share them: github-pr, paste, and in Step 8 github-compare and
  github-commit.
- **`Credentials`** is a core type,
  `{ githubToken(): Promise<string | undefined>; llm(): Promise<LlmSettings> }`.
  The getters are read on every call, so a token saved later applies without
  rebuilding anything. The app implements it from localStorage settings; the CLI
  implements it from env, using the resolver lifted from
  `packages/actions/src/config.ts`.
- **One GitHub client** (`createGithubClient({ credentials })`) owns the base
  URL, the request helper, pagination, GraphQL and `GithubApiError`. Every GitHub
  function takes the client instead of a token.
- `DiffsPayload` gains neutral display fields: `label` (`#123`, `abc1234`,
  `main...feat`), `links[]` and `author { name, avatarUrl? }`. Views render these
  without knowing the source.

### Storage (core `/cache`)

- **Domain repositories** replace the free cache functions: `DiffCache` (entries,
  AI results, LLM session, shared comment, review data, recent/repo listing,
  eviction), `ReviewMarks` and `FileContentCache`. The default implementation
  runs over any unstorage `Storage`.
  - The devframe server will later run the same code on the fs driver.
  - The browser will reach it through an RPC proxy of the same interfaces.
  - A read-only snapshot implementation ignores writes.
- Entries split into `pr-meta:*` (ref, title, label, `lastViewedAt`, size,
  shas) and `pr-body:*` (diff, AI results, session). Eviction and listing touch
  only metadata. Old entries become misses; there is no migration.
- Per-entry updates are serialized inside the repository, so overlapping writes
  (`reviews.load()` alongside `shared.discover()`) no longer lose data.
- `FileContentCache` keys include `serializeRef(ref)`, so a non-commit ref
  (local worktree) can't collide with another source.

### App wiring

- **`createAppContext({ storage, credentials })`** is built at app creation
  (SPA `main.ts`, embed `configureApp`, later the devframe build) and provided
  once. Only pages and top-level composables (`useRecentPullRequests`,
  `useRecentRepositories`) inject it; they pass it **explicitly** into store
  factories. Components never inject it, which preserves the "one `store`
  prop" rule. Tests build a context over the memory driver.
- **`createDiffsStore(source, ctx)`** has one load path: cache by `source.key`,
  fetch, `fingerprint?` for staleness, refresh. It exposes:
  - `store.fileContent?.load(file)`, backed by `source.loadFile`;
  - `store.canRefresh` (true when `fingerprint` exists);
  - `store.auth?`, copied from `source.auth`;
  - `store.reviews?` and `store.shared?`, wrapped from `source.reviews` and
    `source.sharing`.
- **`source-routes.ts`** is the only route mapping: `refFromRoute(route)`,
  `routeForRef(ref)` and `refFromGithubUrl(text)` (PR, compare and commit URLs).
  Pages, header links, recent lists and the landing URL box all use it.

### Unchanged

- UI prefs (`diffs:layout`, `diffs:auto-refresh`, `diffs:show-review-comments`,
  dark mode, embed drawer width) and the derived caches (`diffs:github-token-meta`,
  `diffs:llm-models`) stay browser-local. JSON-cast reads gain valibot
  validation, including the `/upload` sessionStorage handoff.
- Router base and asset base stay absolute. Mounting under a hub path belongs to
  Plan 09's own build.

## Steps

Each step is one PR and keeps behaviour unchanged unless it says otherwise. Each
PR updates `.agents/01-architecture.md` where it changes a contract. Where docs
and code already disagree, the code wins (for example the documented
`pr:{provider}:...` key, and the `autoRefresh` opt-in versus "MUST NOT silently
auto-refetch").

### 1. App context and storage injection

- Add `createAppContext({ storage })` in the app. Provide it from `main.ts` and
  the embed's `configureApp`.
- `createDiffsStore`, `createPullRequestListStore` and their sub-stores take the
  storage from options. Pages and the two recent composables inject the context
  and pass it in.
- `FileDiff.vue` keeps working for now by receiving the storage the same way
  `file-content-context` already arrives. Step 5 removes it.
- Delete the `getDefaultCacheStorage` singleton. The IndexedDB storage is built
  once in the app context.
- **Done when:** no store or composable imports `cache/storage`, and
  `diffs-store.test.ts`, `shared-analysis-store.test.ts` and
  `pull-request-list-store.test.ts` build a memory-driver context with no
  `vi.mock`.

### 2. Core `/cache` repositories

- Move `pr-cache`, `review-cache`, `file-content-cache` and
  `pull-request-list-cache` into core `/cache` as `DiffCache`, `ReviewMarks`,
  `FileContentCache` and `PullRequestListCache`, implemented over an unstorage
  `Storage`. The `CacheStorage`/`PrCacheEntry` types move with them.
- Split `pr-meta:*` from `pr-body:*`. Eviction, `listRecent` and `listRepo` read
  metadata only.
- Serialize writes per entry inside `DiffCache`. Add a test that overlapping
  `setReviewData` and `setAnalyzedResult` calls both land.
- The app context now holds repositories instead of a raw `Storage`.
- **Done when:** core `/cache` passes its tests under plain Node with the memory
  driver, the app imports no unstorage outside the context factory, and
  eviction never reads a `pr-body:*` key (asserted).

### 3. One GitHub client

- Add `createGithubClient({ token })` in core with a single base URL, one request
  helper (body, method, `message` parsing), one paginator, GraphQL and
  `GithubApiError`. It is used by `api.ts`, `review-api.ts`, `review-graphql.ts`,
  `pull-request-list.ts`, `shared-analysis-comment.ts` and `token-meta.ts`.
- `fetchFileContentAtRef` throws `GithubApiError` like the others, so 403
  detection in `github-write-access` covers it.
- Step 4 swaps `token` for `Credentials`. This step only collapses the duplicates.
- **Done when:** `'https://api.github.com'` appears once and `fetchAllPages`
  once, and the existing normalize, review and shared-comment tests pass
  unchanged apart from passing a client.

### 4. `SourceRef`, `DiffSource`, `Credentials` and the generic store

- Add `SourceRef`, `serializeRef`, `DiffSource`, `resolveSource` and
  `Credentials` to core. Implement the github-pr and paste sources.
  `GithubProvider`, `PasteProvider`, `Provider`, `FetchDiffParams` and
  `ProviderCapabilities` are deleted.
- `DiffsPayload` gets `ref`; `provider` and `id` are removed, along with every
  `parseGithubDiffId` call outside components. Components are handled in Step 6.
- The GitHub client takes `Credentials` and reads the token per request.
- `createDiffsStore(source, ctx)` gets one load path. The paste source's
  `fetch()` re-parses as today. github-pr is cache-first with `fingerprint()` for
  staleness.
- App `Credentials` read `settings` live. **Fixes** the stale token after
  `GithubTokenRecovery` saves.
- Pages rebuild the store when the route's ref changes. **Fixes** param-only
  navigation reusing the old store.
- `useProvider` is deleted.
- **Done when:** `createDiffsStore` contains no `kind` or `provider` check;
  the store tests run against a fake `DiffSource` built in the test (a real seam,
  not a module mock); and tests cover saving a token then reloading, and navigating
  `/gh/a/b/1` → `/gh/a/b/2`.

### 5. Full-file content through the store

- `store.fileContent?.load(file)` calls `source.loadFile(path, side)` through
  `FileContentCache`, which is keyed by the ref plus side sha plus path.
- Delete `file-content-context.ts` and the `fetchFileContentAtRef`, cache and
  settings imports in `FileDiff.vue`. The action shows iff `store.fileContent`
  exists.
- The mock store gains `fileContent`, so Storybook exercises "load full file"
  for the first time.
- **Done when:** no component imports from `@pulls.review/core/github` or
  `cache/`, and `FileDiff` has a story that loads a full file.

### 6. Neutral header, `canRefresh`, `auth` and routes

- Sources fill `label`, `links[]` and `author`. `DiffsHeader` renders those and
  never reads `ref.kind`.
- `GithubAvatar` becomes an avatar for `author.avatarUrl`, with an initial-letter
  fallback.
- The refresh button is gated on `store.canRefresh`. `GithubTokenRecovery` is
  gated on `store.auth` instead of `!!store.reviews`, so a compare/commit view
  can recover a token too.
- Add `source-routes.ts` and replace the hardcoded `/gh/...` strings in
  components and pages.
- Delete the commented-out "View comment" block in `DiffShareButton.vue`.
- **Done when:** a grep for `parseGithubDiffId|provider ===|'/gh/` in
  `app/src/components` finds nothing.

### 7. Review and sharing capability APIs; CLI on sources

- Extract `ReviewsApi` (threads, summaries, comments, pending review, submit,
  resolve, viewer, write access) and `SharingApi` (discover candidates, upsert own
  comment). Both live in core, are framework-free, and use neutral ids and sides
  (`old`/`new`, translated to `LEFT`/`RIGHT` inside the GitHub implementation).
- `createReviewsStore` and `createSharedAnalysisStore` wrap the API and drop
  their `{ owner, repo, number }` parameters and direct `@pulls.review/core/github`
  imports. `github-write-access` moves behind `ReviewsApi`.
- Lift the CLI's env resolution into core (`credentialsFromEnv`). `run.ts`
  becomes `resolveSource(ref, { credentials })`, then `source.sharing.upsert(...)`.
- **Done when:** `app/src/stores` imports nothing from `@pulls.review/core/github`
  except the source registry wiring, and the CLI tests pass against a fake
  `SharingApi`.

### 8. GitHub compare and commit sources

- Add github-compare (`GET /repos/{o}/{r}/compare/{base}...{head}`, paginated
  files and commits) and github-commit (`GET /repos/{o}/{r}/commits/{sha}`)
  sources. Both have `fingerprint` (resolved head sha; a commit's fingerprint
  is constant) and `loadFile`, and neither has `reviews` or `sharing`.
- Widen `normalizePullRequest`'s per-file logic so it takes base/head shas plus
  the file list, rather than the PR JSON.
- Routes `/gh/:owner/:repo/compare/:range` and `/gh/:owner/:repo/commit/:sha`.
  `refFromGithubUrl` accepts compare and commit URLs in the landing box.
- Recent lists show every routable kind (github-pr, compare, commit). Paste
  stays out because it has no route by design.
- **Behaviour change:** new routes and wider landing-box input.
- **Done when:** a compare and a commit render with grouping, LLM analysis,
  reviewed marks and "load full file", and captured fixtures back stories for
  both.

## Follow-ups (not this plan)

- **[Plan 04](./04-local-provider.md):** the `local` source in core.
- **[Plan 09](./09-devframe-local-review.md):** the `pulls.review` devframe CLI
  serving it.
- **Paste reviewed marks:** pasted diffs carry abbreviated `index` shas, so their
  reviewed marks don't match the same files reviewed through GitHub. Left as is.

## Not in scope

- New UI beyond the compare/commit routes and the landing-box parsing.
- Moving UI prefs or derived caches out of browser localStorage.
- Router or asset base changes.
