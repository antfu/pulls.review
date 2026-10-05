# Plan 04: local git source

Status: **planned**. Builds on Plan 10 (`DiffSource`, `SourceRef`, core `/cache`).
Plan 09 serves it to the browser.

## Why

Reviewing a change before it is pushed (the working tree, a branch against
`main`, one commit) is as useful as reviewing a PR. Plan 10 made every source a
`DiffSource`, so a local repo is one more implementation: it runs `git` and
returns the same `DiffsPayload` the views already render.

## Scope

A Node-only `@pulls.review/core/local` subpath. The browser bundle never
imports it, because it spawns `git`. Plan 09 runs it in a server and proxies it
to the SPA over RPC.

## Targets

A target is written in git's own revision syntax. It is the CLI argument and
the `?target=` query in Plan 09:

| Target  | Diff                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| (none)  | Working tree vs `HEAD`: staged, unstaged and untracked files together.                        |
| `<rev>` | That commit vs its first parent, like `git show`. A root commit diffs against the empty tree. |
| `A..B`  | The literal tree diff between two revisions.                                                  |
| `A...B` | What `B` adds since it forked from `A` (against `git merge-base A B`).                        |

Revisions resolve to shas at fetch time and land in `base`/`head`. A revision
starting with `-` is rejected before it reaches `git`.

## `SourceRef` and identity

- `{ kind: 'local', repo: string, target: string }`. `repo` is the repository's
  root path, and `target` is the text above (`''` for the working tree).
- `serializeRef` gives `local:{repo}:{target}`. This key scopes the diff cache
  and `FileContentCache`, so a working-tree "sha" can't collide with anything.
- `label` is the target as written, or `working tree`. `title` is the commit
  subject for a single commit, and the target otherwise.

## Running git

Every call is `execFile('git', args, { cwd, env: { ...env, LC_ALL: 'C', GIT_PAGER: 'cat' } })`
with a large `maxBuffer`, never a shell. The diff call is pinned so that
`patch-parser` reads it the same way every time:

```sh
git -c core.quotePath=false diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ --full-index -M <base> <head?>
```

- **Never `show` or `format-patch`.** Their commit preamble and `-- ` trailer
  confuse the parser.
- **`--full-index`** gives real 40-character blob shas, so reviewed marks are
  keyed exactly as on GitHub.
- **Untracked files** (working-tree target): copy `.git/index` to a temp file,
  set `GIT_INDEX_FILE` to it, run `git add -N .` (which respects `.gitignore`),
  then diff against `HEAD` with that index. The user's real index is never
  touched.
- **Commits** come from `git log --format=%H%x00%B%x00 base..head`, oldest first.

## Large files

A file whose patch text exceeds 512 KB keeps its path, status and
`--numstat` counts, but carries no hunks and gets a new optional
`FileChange.truncated: true`. The view shows "diff too large" and offers
"load full file". The LLM prompt lists the file as omitted.

## Parser fix

`patch-parser` reads only `a/`/`b/` prefixed paths. With `core.quotePath=false`,
git still quotes paths that contain a tab, a newline or a `"`. Handle
the quoted form of the `diff --git` header and of `rename from/to`. No other
parser changes: the pinned flags keep every other output shape away from it.

## Capabilities

- `fingerprint()`: a hash of the resolved shas and, for the working tree,
  `git status --porcelain=v2 -z`. Plan 09 pushes changes rather than polling;
  this is what it compares.
- `loadFile(path, sha)`: `git show {sha}:{path}`. The working tree's head side
  reads the file from disk instead. Binary content is detected by a NUL byte.
- No `viewer`, `reviews`, `sharing` or `auth`: a local diff has no review
  lifecycle and needs no credentials.

## Testing

Co-located `*.test.ts` files build a real repository in a temp dir with `git`
and cover:

- every target kind, including a root commit and a merge-base range;
- an untracked file, with the real index left unchanged afterwards;
- a rename, a binary file and a path with a quote;
- a truncated file;
- the same text through `createPasteSource` parsing to the same `FileChange`s.

## Out of scope

- Merge commits' combined diffs (`diff --cc`).
- Staged-only or unstaged-only targets (the working-tree target merges them).
- Serving any of this to a browser (Plan 09).
