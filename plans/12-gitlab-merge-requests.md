# Plan 12: GitLab merge requests

Status: **built**. A build talks to one GitLab instance: gitlab.com, or a self-managed one named at build time.

## Why

A merge request is the same thing to review as a pull request: a diff with a
history, a discussion and a head that moves. `DiffSource` already describes
that, so GitLab is one more source behind it, not a second way of loading a
diff.

## Scope

- `/gl/{namespace...}/{project}/-/merge_requests/{iid}` opens a merge request
  on the same page as a pull request, and `/gl/{namespace...}/{project}` lists
  the project's open merge requests.
- A pasted `https://gitlab.com/group/subgroup/project/-/merge_requests/123`
  (or `group/project!123`) opens it; a project URL opens its list.
- Read: metadata, files, commits, full file content, staleness by head sha.
  Public merge requests load without a token.
- Review: threads on diff lines, replies, edit, delete, resolve, comments on
  the merge request, approve and revoke approval.
- Sharing an AI analysis as a note, in the comment format of Plan 07.

Not built: CI status, a GitLab userscript, compare and commit routes, OAuth,
merging, and more than one GitLab instance in a single build.

## The ref and its keys

`{ kind: 'gitlab-mr', host, project, iid }`. `project` is the full path with
every namespace. `host` is part of the ref, so two instances can never share a
key: `serializeRef` gives `gitlab:{host}/{project}!{iid}` (a host holds no `/`,
a project path no `!`).

A list is keyed by a `RepositoryRef` (`github-repo` or `gitlab-project`).
GitHub lists keep their `pulls:{owner}/{repo}` key; a GitLab list is
`pulls:gitlab:{host}/{project}`, which no GitHub key can equal.

## Reading the diff

Four requests in parallel:

| Request                             | Gives                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| `GET merge_requests/:iid`           | title, branches, state, `diff_refs`, `changes_count`   |
| `GET merge_requests/:iid/diffs`     | the changed files and their patches, every page        |
| `GET merge_requests/:iid/commits`   | commit messages (newest first; reversed)               |
| `GET merge_requests/:iid/raw_diffs` | blob shas, binary markers, patches the listing omitted |

The listing decides which files changed and how. It carries no blob sha and no
line counts, and it leaves out a patch it finds large (`collapsed`,
`too_large`). The raw diff fills those in. Lines are counted from the patch.

- **`FileChange.sha`** is the blob sha from the raw diff's `index` line. An
  instance without `raw_diffs` answers 404; then a file with a patch is keyed
  by a hash of its paths and patch, and a file without one (binary, pure
  rename, omitted) by `{head sha}:{path}`, which lasts until the next push. A
  commit sha is never used as a file's sha.
- **A patch nothing can supply** keeps its file, marked `truncated`. No
  changed file is dropped.
- **GitLab stops storing files at an instance limit.** `changes_count` then
  ends in `+` (or exceeds what was listed) and the payload is marked
  `incomplete`, which the page says in a banner.

## Reviews

GitLab has no review object. The `ReviewsApi` contract maps like this:

| Contract               | GitLab                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `fetch`                | discussions, approvals and the merge request (for its head sha)     |
| thread                 | a discussion whose first note has a diff position                   |
| summary                | each approval, and each comment on the merge request as a whole     |
| `addComment`           | `POST discussions` with a position                                  |
| `reply`                | `POST discussions/:id/notes`                                        |
| `editComment`/`delete` | `PUT`/`DELETE notes/:id`                                            |
| `resolveThread`        | `PUT discussions/:id` `resolved: true` (`unresolveThread`: `false`) |
| `submitReview`         | `APPROVE`: `POST approve`; a body: `POST notes`                     |
| `revokeApproval`       | `POST unapprove`                                                    |

`ReviewsApi.supports` says what a source's review model has. GitLab reports
`pendingReview: false` and `requestChanges: false`, and the view then offers
neither "Start a review" nor "Request changes":

- Draft notes hold comments back like a pending review, but they have their own
  ids and no review to belong to; the contract's `PendingReview` does not
  describe them.
- GitLab documents no REST call for requesting changes.

### Positions

A GitLab position names a line by its number on both sides and pins it to one
diff version (`base_sha`, `start_sha`, `head_sha`). `providers/gitlab/position.ts`
translates:

- an added line: `new_line` only; a removed line: `old_line` only; an unchanged
  line: both, found by walking the file's hunks;
- a renamed file: `old_path` and `new_path`;
- a multi-line comment: a `line_range` whose ends carry GitLab's line code,
  `sha1(path)_{old}_{new}`.

A comment is placed on the version the reviewer loaded. If the merge request
has moved past it (new commits, a force push), the write is refused with the
`diffOutdated` diagnostic rather than landing on lines the reviewer never saw.

Reading back, a thread whose position is pinned to an older head is
`outdated`. GitLab itself moves a position forward while its line survives new
commits. A comment on a whole file or an image has no line and is treated as
outdated too.

## Sharing

A shared analysis is a note with the same body as GitHub's comment, linking to
`https://pulls.review/gl/{project}/-/merge_requests/{iid}?from={username}`.
Discovery reads the 100 most recently updated notes in one request. Sharing
updates the viewer's own note when one exists. The body format now lives in
`providers/shared-analysis-body.ts`; GitHub's output is unchanged.

## Tokens

- Settings holds a personal access token for the build's GitLab instance,
  separate from the GitHub one (see "Which instance").
- `read_api` is enough to read. Every write needs `api`.
- gitlab.com serves a public merge request's diff to anyone, but its
  discussions and notes only to a token. An anonymous visitor sees the diff
  without threads or shared analyses.
- The token is sent as an `Authorization` header and never appears in a URL, a
  cache key or an error.

## Which instance

A build talks to one GitLab instance. `PR_GITLAB_HOST` names it at build time
(a host, with a port if it has one); unset, it is `gitlab.com`. The app reads it
as `GITLAB_HOST` (`app/gitlab-host.ts`):

- `/gl/...` routes and pasted URLs mean that host. A URL on any other GitLab
  host is not read.
- Settings shows one GitLab token, saved under that host in
  `settings.gitlabTokens`. `Credentials.gitlabToken(host)` returns the token
  saved for the host it is asked about, so a build pointed at a different host
  later does not send it the old one.
- A ref on any other host formats as `/gl/@{host}/...` (no namespace starts
  with `@`), which no route matches.

Requests go to `https://{host}/api/v4`. An instance served under a path prefix,
or over plain HTTP, is not supported.

Not done for a self-managed build: the link in a shared analysis still points
at `https://pulls.review/gl/@{host}/...`, which such a deployment cannot open.

## Known gaps

- The view hides resolved threads, so `unresolveThread` has no button.
- The list has no approval state, pipeline status or diff size: GitLab's
  listing does not carry them.
- Interface text says "pull request" for a merge request.
- A namespace has no avatar to fetch by name; lists show its initial.

## Verification

Checked against gitlab.com: browser CORS (any origin, the `Authorization`
header, pagination headers exposed), and anonymous reads of a public merge
request's metadata, diffs, raw diff, commits, approvals, file content and
project list, both from Node and in the running app.

Covered by tests against recorded response shapes, not exercised against
gitlab.com: every request that needs a token, which is all discussion reads
and every write.
