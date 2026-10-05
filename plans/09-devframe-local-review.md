# Plan 09: local review through devframe (`pulls.review` CLI)

Status: **in progress**. Depends on Plan 04 (the `local` source) and Plan 10.

Built so far: the `pulls.review [target]` server, the `source.*`, storage and
GitHub-token RPC functions, and the `PR_LOCAL` SPA with its code prompt and
`/local/<target>` route. Not built yet: the env LLM keys over RPC, the change
push, the current-branch PR, the `build` snapshot, and the hub playground.

How the built part differs from the plan below:

- **Cache.** The RPC functions expose an unstorage driver over the fs
  directory, not the repositories. The browser runs the same core `/cache`
  repositories on top of it, so eviction runs in the browser, reading only
  `pr-meta:*` documents. Keys are escaped to one file per entry
  (`flatKeys`), because the fs driver would otherwise turn every `:` into a
  directory.
- **Target in the path.** The target sits in the path (`/local/main...feat`,
  `/local/` for the working tree) rather than in `?target=`. `App.vue` keys
  pages by path, so another target remounts the page.
- **Fixed mount path.** The SPA uses the fixed mount path `/__pulls.review/` for
  both its assets and its router, standalone and in a hub, instead of a
  runtime base.

## Why

Plan 04's `local` source has to run `git`, so it can't run in the browser.
[devframe](https://github.com/devframes/devframe) is a framework-neutral base
for building DevTools. One definition (`defineDevframe`) serves an SPA with a
Node RPC backend as a standalone CLI, bakes it into a static snapshot, or
mounts it as a dock inside a hub such as Vite DevTools. That covers all three
ways a local review should be reachable, without a backend we run: the server
is the user's own process on the user's own machine.

## Package

`packages/cli`, published as the unscoped `pulls.review` (the name reserved for
this in #49). The GitHub Actions entry point stays `@pulls.review/actions`
and MUST NOT depend on devframe. Releases require explicit approval.

| Command                                                   | Does                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `pulls.review [target] [--open] [--port]`                 | Serves the review of `target` (Plan 04 syntax) for the repo at `cwd`. |
| `pulls.review build [target] --out-dir <dir> [--analyze]` | Writes a static, read-only snapshot of one target.                    |

- **Hub mount.** The package also exports the definition for a hub through
  `createPluginFromDevframe`. The devframe id is `pulls.review`, so hubs mount
  it at `/__pulls.review/`.
- **Trust.** devframe's default trust model stays on: the server prints a
  one-time code, and `--open` lands the tab already trusted. Only trusted
  clients reach any RPC below.

## Server (RPC functions)

Each function is a `defineRpcFunction` with valibot schemas.

| Function                                                                 | Backed by                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.key` / `source.fetch` / `source.fingerprint` / `source.loadFile` | Plan 04's `local` source for the target in the URL.                                                                                                                                                                                                                    |
| `cache.*`                                                                | Core `/cache` repositories over the unstorage fs driver at `<git-common-dir>/pulls-review` (`git rev-parse --git-common-dir`). The cache is shared by every worktree of the repo, is never committed, and is gone when the repo is. Eviction runs here, on the server. |
| `credentials.githubToken`                                                | `@pulls.review/core/env`, then `gh auth token`; `undefined` when neither has one.                                                                                                                                                                                      |
| `credentials.llm`                                                        | `llmSettingsFromEnv(process.env)`.                                                                                                                                                                                                                                     |
| `branch.pullRequest`                                                     | The open GitHub PR whose head is the checked-out branch (below).                                                                                                                                                                                                       |

- **Secrets.** They reach the browser only through these trusted functions. The
  browser runs analysis and chat exactly as on the site, and falls back to the
  Settings modal when the environment has no key.
- **Change push.** The server watches `HEAD`, `index`, `refs` and `packed-refs`
  (under git-dir and git-common-dir) for every target. For the working-tree
  target it also watches the worktree recursively. Events are debounced by
  300 ms, the fingerprint is recomputed, and an event is broadcast only when it
  changed. The view shows the existing "new changes" banner and never refetches
  on its own.
- **Current-branch PR.** The server reads the github.com URLs of the branch's
  upstream remote, `origin` and `upstream`, then asks each candidate base repo
  for an open PR with `head=<owner>:<branch>`. The first match wins.

## SPA (`PR_LOCAL` build)

The app gains a third compile-time flag next to `PR_LLM` and `PR_EMBED`, built
by its own `vite.config.local.ts` into the package. The public site never
ships the devframe client or the `/local` route.

- **App context.** The `PR_LOCAL` build installs an app context (Plan 10)
  whose:
  - `cache` repositories are an RPC proxy of the server's, and
  - `credentials` read the RPC functions above.

  Stores and components don't change.

- **Routes.**
  - `/local?target=<target>` builds a `DiffSource` proxy over the RPC
    `source.*` functions.
  - When `branch.pullRequest` finds a PR, a banner links to the in-app
    `/gh/{owner}/{repo}/{number}` route. That route works there with comments
    and reviews, using the server's token.
- **Base path.** The build uses relative assets (`base: './'`), and the router
  reads its base at runtime. The same bundle then runs at `/` (standalone) and
  at `/__pulls.review/` (hub).

## Snapshot (`build`)

`build` runs the definition with `mode: 'build'` for one target. It bakes in
the diff, the commit list, and the full content of every changed file on both
sides, so "load full file" works offline. It is read-only: its cache
repositories ignore writes, and it has no staleness.

`--analyze` runs the LLM at build time with environment keys and bakes the
result in, like the Actions comment. Viewers see it but can't re-run it or
chat. Without the flag, viewers get rule-based grouping only.

## Testing

- **RPC.** Integration tests run the RPC functions against a temp git repo,
  under the cache's fs driver in a temp dir.
- **Hub.** `packages/cli/playground` is a minimal page built on
  `@devframes/hub` and `@devframes/hub-ui` that installs the definition as a
  dock (`pnpm -F pulls.review play`). A Playwright smoke test checks that the
  dock opens and the working-tree diff renders.
- **Snapshot.** A test builds a snapshot of a temp repo and checks it renders
  with no server.

## Out of scope

- An in-app branch/commit picker. The target comes from the CLI argument or the
  URL.
- Commenting on local diffs.
- Shipping as an editor extension.
