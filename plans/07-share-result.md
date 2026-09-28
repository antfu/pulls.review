# Plan 07: Share an AI analysis as a PR comment

Status: **built**.

## Why

AI analysis needs an API key and a network path the github.com embed doesn't
have (GitHub's CSP blocks model providers). A reviewer who has both can post
their result as a Conversation comment on the PR; anyone else - including the
embed, and visitors with no token at all on public repos - loads it from
there instead of paying for their own run.

## Scope

- A **Share result** button (site only) beside "Analyze with AI", shown once a
  locally generated AI result exists. It creates one issue comment per user
  and updates that same comment on later shares. Updates are manual - never a
  side effect of re-analyzing.
- Loading shared results (site **and** embed): an inline banner offers the
  analyses found on the PR; `?from=<login>` on the site deep-links one.
- Only `llm`/`web-llm` results are shareable, and only the `GroupedResult` -
  never the chat transcript, never `rule-based` (free to recompute).

## Comment contract

````
<!-- pulls.review data -->
See a better organized pull request review at https://pulls.review/gh/{owner}/{repo}/{number}?from={login}

<details><summary>Analyzed by {model} at {generatedAt, YYYY-MM-DD HH:mm UTC} · head {sha7}</summary>

```json
{ "headSha": "...", "result": { ...GroupedResult } }
```

</details>
````

- Line 1 is the detection marker. A comment without it is never parsed.
- The fenced block validates against `SharedAnalysisSchema`
  (`app/types/shared-analysis.ts`); anything invalid is ignored silently.
- The link origin is the hardcoded `https://pulls.review`, never
  `location.origin` (a preview host must not leak into a public comment).
- Bodies over 60k characters are refused (GitHub caps at 65536).

## Behaviour

- **Reuse**: share tries the comment id cached on the `pr:*` entry
  (`PATCH`), falls back to scanning for the viewer's own marked comment, and
  only then `POST`s.
- **Discovery** runs after the diff loads, only when the store holds no AI
  result yet: one `GET .../issues/{n}/comments?per_page=100` (first page
  only, best-effort). Candidates are ordered newest first; the viewer's own
  comment is offered too, labelled "you". Dismiss is in-memory.
- **`?from=login`** (site): no AI result -> load that user's comment silently;
  a local AI result exists -> banner "X shared an analysis - Load (replaces
  yours)"; not found -> notice plus normal discovery. The URL is untouched.
- **Loaded results** persist in the cache under `analyzedBy[result.source]`
  with `sharedBy: login`, switch `analyzeMode` to that source, and are
  labelled stale (banner) when `headSha` differs from the loaded diff's head.
  Re-analyze replaces them; Refresh drops them (the existing reset), after
  which discovery re-offers them. Chat is not enabled for a shared result.
- **Write gating** reuses the review gating (`app/stores/github-write-access.ts`):
  classic PAT scopes, fine-grained optimistic-until-403.

## Where things live

- `app/types/analyze.ts` - `GroupedResult.model` (stamped by the llm adapter)
  and `GroupedResult.sharedBy`.
- `app/types/shared-analysis.ts` - `SharedAnalysisSchema`.
- `app/providers/github/shared-analysis-comment.ts` - body render/parse and
  the issue-comment REST calls.
- `app/stores/shared-analysis-store.ts` - `DiffsStore.shared`: discovery,
  load, share. Created by `createDiffsStore` for `github-pr` params.
- `analyzeMode` / `hasAiResult` / `setAnalyzeMode` moved from `store.llm` to
  the store root so the embed (`llm: false`) can show the Rules | AI toggle.
- View: `DiffShareButton.vue` (header), `SharedAnalysisBanner.vue` (page).
