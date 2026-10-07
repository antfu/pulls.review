# Plan 09: local review through devframe (`pulls.review` CLI)

Status: **in progress**. Depends on Plan 04 (the `local` source) and Plan 10.

Built so far: the `pulls.review [target]` server, the `source.*`, `repo-info`,
storage and GitHub-token RPC functions, the `PR_LOCAL` SPA with its code
prompt, ref picker and review pages, and the site's `/gh/...` pages reached
from the picker's URL box or a GitHub argument. Not built yet: the env LLM keys
over RPC (superseded by `plans/11-local-agents.md`), the change push, the
current-branch PR, the `build` snapshot, and the hub playground.

## Pages

The server holds no target. Every page names its own, and the CLI's argument
only picks which page opens:

| Page               | Reviews                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | A ref picker: base and head fields with the repo's branches and tags (or any typed ref), plus shortcuts to the current branch, the working tree and the last 10 commits.          |
| `/branch/<name>`   | What the branch adds since it forked from the default branch: `origin/HEAD`'s branch, else `main`, else `master`, through `origin/<name>` when it exists. Committed changes only. |
| `/compare/<A...B>` | Any range, `A...B` or `A..B`.                                                                                                                                                     |
| `/worktree`        | Uncommitted changes against `HEAD`, untracked files included.                                                                                                                     |
| `/commit/<sha>`    | One commit against its parent.                                                                                                                                                    |
| `/gh/...`          | The site's GitHub pages (PR, compare, commit, open-PR list), unchanged, with the server's token: comments and reviews work. The picker has a URL box for them.                    |

| Command                                      | Opens                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pulls.review`                               | `/branch/<current>`, or `/` when the default branch is checked out or HEAD is detached. |
| `pulls.review A...B` / `A..B`                | `/compare/A...B`                                                                        |
| `pulls.review <local branch>`                | `/branch/<name>`                                                                        |
| `pulls.review <other rev>`                   | `/commit/<rev>`                                                                         |
| `pulls.review --worktree`                    | `/worktree`                                                                             |
| `pulls.review owner/repo#1` / `<github URL>` | The matching `/gh/...` page (`parseGithubUrl` in core, shared with the site's URL box). |

## How the built part differs from the plan below

- **Cache.** The RPC functions expose an unstorage driver over the fs
  directory, not the repositories. The browser runs the same core `/cache`
  repositories on top of it, so eviction runs in the browser, reading only
  `pr-meta:*` documents. Keys are escaped to one file per entry
  (`flatKeys`), because the fs driver would otherwise turn every `:` into a
  directory.
- **Base path.**
  - The SPA serves at `/` standalone and at `/__pulls.review/` in a hub, with
    no `basePath` on the definition. One bundle decides which in the page: an
    inline script writes a `<base>` before any asset loads, and relative assets,
    the router and devframe's connection lookup all resolve from it.
  - devframe's SPA fallback skips paths that look like files, and refs do
    (`main...feat`, `v1.2`). So the CLI serves `index.html` itself for
    `/compare/`, `/branch/`, `/commit/` and `/gh/`. Inside a hub, a reload of a
    ref page whose ref ends in `.<word>` still misses; navigating there from the
    picker works.

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

| Command                                                                    | Does                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pulls.review [target] [--worktree] [--github-token] [--port] [--no-open]` | Serves reviews of the repo at `cwd`, opening the page for `target` (see Pages above). |
| `pulls.review build [target] --out-dir <dir> [--analyze]`                  | Writes a static, read-only snapshot of one target.                                    |

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
| `credentials.githubToken`                                                | `--github-token`, then `@pulls.review/core/env`, then `gh auth token`; `undefined` when none has one.                                                                                                                                                                  |
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
  - The site's `/gh/...` routes stay registered (`router.ts`), so a PR, compare,
    commit or open-PR list works there with comments and reviews, using the
    server's token. The picker's URL box and the CLI argument lead to them;
    when `branch.pullRequest` finds a PR, a banner will too.
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
