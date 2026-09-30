# Goal

pulls.review is a better way to review a GitHub pull request's
diff: grouped, summarized, and fast, instead of GitHub's flat file-by-file
list. It renders any PR at `/gh/{owner}/{repo}/{number}`, lists a repo's open
PRs at `/gh/{owner}/{repo}`, and renders any raw `.diff`/`.patch` text pasted
or uploaded at `/upload`.

## Why

GitHub's own PR view doesn't scale well to large or sprawling changes: every
file gets equal visual weight regardless of whether it's the actual change,
a generated lockfile, or a docs update, and there's no narrative tying
related files together. [Linear's PR review
guides](https://linear.app/docs/diffs#guides) show what's possible instead —
breaking a large PR into explained, grouped sections before a reviewer goes
file-by-file. pulls.review aims at that same experience, but as a standalone,
zero-backend tool usable on any public or private PR, not tied to a project
management product.

## Core value proposition

1. **Grouping** — files are grouped (code / tests / docs / deps / config /
   generated / other, or LLM-defined groups) instead of presented as
   one flat list, so a reviewer can skip straight to what matters.
2. **Summarization** — when an LLM is configured, each group (and the PR as
   a whole) gets a short written summary. Without one, a fast deterministic
   rule-based grouping still gives structure for free.
3. **Performance** — large PRs (hundreds of files, huge individual files)
   should stay fast via virtualization, not degrade the way GitHub's own UI
   does.
4. **Zero backend** — everything (fetching, caching, analysis) runs in the
   visitor's browser. Auth is a self-supplied GitHub token; LLM access is a
   self-supplied key or gateway token. Nothing is proxied through a server
   we run.

## Longer-term direction (see `01-architecture.md` for what's deferred vs. built)

- LLM-powered analysis (richer summaries) as an opt-in alongside the
  always-available rule-based fallback, plus a fully in-browser (`web-llm`)
  option requiring no API key at all.
- Reviewing PRs interactively from within pulls.review (built): inline review
  comment threads, replies, and GitHub-style review submission
  (approve/request changes/comment), degrading to read-only when the token
  can't write.
- Sources beyond GitHub: pasted/uploaded raw patches (built early, since
  it's essentially free once a patch parser exists), and eventually a local
  CLI-driven provider for diffing a working tree.
- A userscript that embeds pulls.review as a sidepanel directly inside GitHub's own
  PR page, next to the real comment thread — reviewing with pulls.review's grouping
  without leaving github.com.
- A VS Code extension ("devframe") that surfaces pulls.review inside the editor —
  visualizing the local working-tree diff or the PR matching the currently
  checked-out branch, similar in spirit to the official GitHub Pull Requests
  and Issues extension, but with pulls.review's grouping/summarization. Builds on
  the `local` provider once that exists.

## Explicit non-goals

- Being a general git hosting/PR management product (no merging, no CI
  integration, no issue tracking).
- A dashboard or account system. pulls.review is deep-links (plus a per-repo
  open-PR list to reach them) and local (per-browser) history, not a hosted
  product with accounts.
