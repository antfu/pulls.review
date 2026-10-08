# Goal

pulls.review is a better way to review a GitHub pull request's
diff: grouped, summarized, and fast, instead of GitHub's flat file-by-file
list. It renders any PR at `/gh/{owner}/{repo}/{number}` (and any compare or
commit at `/gh/{owner}/{repo}/compare/{base}...{head}` and `.../commit/{sha}`), lists a repo's open
PRs at `/gh/{owner}/{repo}`, and renders any raw `.diff`/`.patch` text pasted
or uploaded at `/upload`. A gitlab.com merge request opens the same way at
`/gl/{namespace...}/{project}/-/merge_requests/{iid}`, and a project's open
merge requests at `/gl/{namespace...}/{project}`.

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
   visitor's browser, or in the user's own CI through the `pulls.review`
   CLI. Auth is a self-supplied GitHub token; LLM access is a self-supplied
   key or gateway token. Nothing is proxied through a server we run.

## Longer-term direction (see `01-architecture.md` for what's deferred vs. built)

- LLM-powered analysis (richer summaries) as an opt-in alongside the
  always-available rule-based fallback, plus a fully in-browser (`web-llm`)
  option requiring no API key at all.
- Analyzing every PR once from a workflow (built): the `pulls.review` CLI and
  its GitHub Action post the same shared-analysis comment a reviewer can, so
  the site and the embed show the result without anyone spending a key.
- Reviewing PRs interactively from within pulls.review (built): inline review
  comment threads, replies, and GitHub-style review submission
  (approve/request changes/comment), degrading to read-only when the token
  can't write.
- Sources beyond GitHub: pasted/uploaded raw patches (built early, since
  it's essentially free once a patch parser exists), GitHub compare ranges and
  single commits (built), gitlab.com merge requests with their discussions and
  approvals (built, `plans/12-gitlab-merge-requests.md`), and a `local` source
  for a git working tree, commit or range (`plans/04-local-provider.md`).
- A userscript that embeds pulls.review as a sidepanel directly inside GitHub's own
  PR page, next to the real comment thread — reviewing with pulls.review's grouping
  without leaving github.com.
- A `pulls.review` CLI that reviews local git changes (the working tree, any
  ref range, one commit) in the browser through
  [devframe](https://github.com/devframes/devframe), a framework for building
  DevTools: a standalone local server, a static snapshot, or a dock inside a
  devframe hub such as Vite DevTools. It also links the PR matching the
  checked-out branch. Builds on the `local` source
  (`plans/09-devframe-local-review.md`).

## Explicit non-goals

- Being a general git hosting/PR management product (no merging, no checks
  or status reporting, no issue tracking). The CLI posts a comment the site
  reads; it does not gate anything.
- A dashboard or account system. pulls.review is deep-links (plus a per-repo
  open-PR list to reach them) and local (per-browser) history, not a hosted
  product with accounts.
