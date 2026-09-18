# Plan 05: GitHub PR reviews (comment threads + review submission)

Status: **built**. This plan was originally "read/post comment threads"; scope
grew (by explicit decision) to the full GitHub review flow, superseding the
old "no formal review submission" non-goal in `.agents/00-goal.md`.

## Scope

- Render existing review comment threads inline in the diff, and review
  summaries (approve/request-changes verdicts + bodies) in a collapsible
  section under the header. Conversation (issue) comments stay out.
- Leave reviews GitHub-style: a server-side **pending review** (adopted on
  load if one already exists, e.g. started on github.com), draft comments
  added to it, submitted as Approve / Request changes / Comment, or
  discarded. "Add single comment" posts immediately outside a review.
- Replies, edit/delete own comments, multi-line comments (drag
  line-selection), resolve threads.
- A global persisted toggle (`diffs:show-review-comments`) hides submitted
  threads; the viewer's own pending drafts always render.
- Full feature ships in the github.com embed too (same settings singleton,
  GitHub's CSP allows `api.github.com`).

## Decisions that shape the implementation

- `supportsComments` is `true` on the `github` provider only; `paste`/`local`
  stay `false` permanently. `DiffsStore.reviews` is `undefined` when the
  capability is off - components gate on its presence, like `store.llm`.
- **Hybrid REST + GraphQL.** Everything is REST
  (`app/providers/github/review-api.ts`) except what REST cannot do
  (`review-graphql.ts`): thread resolution (status read + resolve mutation)
  and adding a draft comment to an _existing_ pending review
  (`addPullRequestReviewThread` - REST only attaches comments at review
  creation). Replies always post immediately via REST, even mid-review.
- **Hidden, not collapsed:** resolved threads and outdated threads
  (`line: null` from GitHub) don't render; files show a non-interactive
  "N resolved" count. Unresolve is deliberately absent (no UI to host it).
- **Write gating** (`reviews.canWrite`): classic PATs are gated on their
  `x-oauth-scopes` (`repo`/`public_repo`); fine-grained PATs expose no scopes
  and start optimistic - the first 403 sets `writeBlockedReason` and flips
  the session read-only. No token = read-only, write UI hidden entirely.
  Without a token there's also no GraphQL, so resolution is silently unknown.
- **SWR caching:** the normalized `ReviewData` snapshot persists on the PR
  cache entry (`PrCacheEntry.reviews`) and seeds the view; a fresh fetch
  always follows, and every mutation refetches.
- Comment bodies are raw markdown rendered client-side via `@comark/vue`,
  same as group summaries.

## Where things live

- Canonical types: `app/types/comment-threads.ts` (valibot; sides use
  pierre's `additions`/`deletions` vocabulary, mapped to GitHub's
  `RIGHT`/`LEFT` at the provider boundary).
- Provider: `review-api.ts` (REST), `review-graphql.ts` (GraphQL),
  `review-normalize.ts` (raw JSON -> `ReviewData`: threading by
  `in_reply_to_id`, pending flags, summaries vs pending review split).
- Store: `app/stores/reviews-store.ts` (`createReviewsStore`), created by
  `createDiffsStore` for `github-pr` params; mock in `mock-diffs-store.ts`.
- View: `ReviewThreadCard.vue` / `ReviewCommentCard.vue` /
  `CommentComposer.vue` (inline, projected into `@pierre/diffs`' annotation
  slots), `ReviewSummaries.vue` (page), `ReviewSubmitModal.vue` (header).
- Inline anchoring: `FileDiff.vue` passes `lineAnnotations` (one per anchor
  line - duplicate slot names would swallow content, so threads sharing a
  line stack in one group) and renders light-DOM children with
  `slot="annotation-<side>-<line>"` + `data-annotation-slot`, projected into
  the shadow root. The gutter "+" is the library's built-in one
  (`enableGutterUtility` + `onGutterUtilityClick`); multi-line ranges come
  from `enableLineSelection`. Note: the library's `renderAnnotation` callback
  is a no-op under `isContainerManaged: true` - slot projection is the seam.

## Testing

- Co-located tests: `review-api.test.ts`, `review-graphql.test.ts`,
  `review-normalize.test.ts`, `reviews-store.test.ts` (gating, SWR, endpoint
  selection, 403 flip), all `vi.stubGlobal('fetch', ...)` with real
  `Response`s.
- Stories for every new component, plus `FileDiff` stories with threads
  (`WithThreads`, `ReadOnlyThreads`) backed by `createMockReviewsStore`.
