# Plan 08: `@pulls.review/core` and the `@pulls.review/actions` CLI / GitHub Action

Status: **built**.

## Why

Plan 07 lets one reviewer share an AI analysis as a PR comment so everyone else
loads it for free. That still needs a person with a key to open the PR first. A
workflow that runs on every pull request and posts the same comment makes the
analysis there before anyone looks - and the site, the embed and visitors with
no token all already know how to read it.

The CLI runs with the user's own tokens, in the user's own CI. Nothing is proxied
through a server we run, which is the invariant behind "zero backend".

## Layout

The repo is a pnpm workspace:

| Package            | Name                          | Build  | Role                                                                       |
| ------------------ | ----------------------------- | ------ | -------------------------------------------------------------------------- |
| `packages/app`     | `@pulls.review/app` (private) | Vite   | The SPA and the github.com embed.                                          |
| `packages/core`    | `@pulls.review/core`          | tsdown | Everything runtime-agnostic, as subpath entries (below).                   |
| `packages/actions` | `@pulls.review/actions`       | tsdown | `pulls-review-actions [owner/repo#n]`: fetch, analyze, upsert the comment. |

Core has no root barrel; each subpath is one `src/<entry>.ts` and one tsdown entry:

| Subpath                           | Holds                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@pulls.review/core/types`        | The canonical valibot schemas and types (`DiffsPayload`, `GroupedResult`, review threads, provider params).                      |
| `@pulls.review/core/patch-parser` | Unified-diff parsing.                                                                                                            |
| `@pulls.review/core/github`       | `GithubProvider` and every REST/GraphQL call, including the shared-analysis comment.                                             |
| `@pulls.review/core/paste`        | `PasteProvider`.                                                                                                                 |
| `@pulls.review/core/analyze`      | `createRuleBasedAdapter`, `createNoneAdapter`, the rules, `LlmSettings` and `resolveModel` - grouping without the agent runtime. |
| `@pulls.review/core/llm`          | The pi agent loop, chat, tools, prompt and model SDKs; load only once a model is configured.                                     |
| `@pulls.review/core/diagnostics`  | The nostics catalog.                                                                                                             |
| `@pulls.review/core/locales`      | The locale list and detection.                                                                                                   |

The app resolves `@pulls.review/core/*` to source (`coreAlias` in
`vite.config.shared.ts`, `paths` in its tsconfig), so it has no core build step
and the embed's `PR_LLM` dead-code elimination keeps working through the alias.
The embed build's forbidden-modules check is the regression guard for that.

## What core MUST NOT know

Core is consumed by a browser SPA and a Node CLI, so it has no access to
Settings, vue-i18n, `localStorage`, `document` or Vite-only syntax:

- **Model access is an argument.** `resolveModel(llm: LlmSettings)`,
  `runLlmAnalysis(diff, resolved, locale, options)`, `createChatSession({ ..., locale })`.
  The app binds them to `settings.value` in `app/analyze/adapters/llm/index.ts`
  and `useLlmChat`; the CLI builds `LlmSettings` from the environment.
- **Group text is injected.** `createRuleBasedAdapter(key => RuleText)` and
  `createNoneAdapter(() => label)`; the app's registry (`app/analyze/index.ts`)
  passes `t()` lookups so labels follow the UI language, as before.
- **Progress is structured.** `AnalyzeProgress` is `{ step, kind: 'thinking' | 'reading' | 'organizing', paths? }`;
  the app words it in `i18n/core-messages.ts` (`describeProgress`), the CLI in
  its own English.
- **Errors are nostics diagnostics.** `diagnostics.ts` is the catalog
  (`llmNotConfigured`, `tokenRejected`, `commentTooLarge`); codes are stable.
  The app translates by code (`localizeError`) and falls back to the English
  message for codes it has no translation for. The CLI prints
  `formatDiagnostic`. Core MUST NOT throw a bare string for a problem a person
  has to act on - add a code.
- **Dependencies MUST be real ESM.** `lz-string-es` replaces `lz-string`, whose
  CommonJS build only resolved named imports through Vite, not under Node.

## CLI contract

Resolution order everywhere: flag > `PULLS_REVIEW_*` > conventional variable.

| Flag         | `PULLS_REVIEW_*`            | Conventional                                                  | Notes                                                                                                     |
| ------------ | --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| -            | `PULLS_REVIEW_GITHUB_TOKEN` | `GITHUB_TOKEN`                                                | Required.                                                                                                 |
| `--provider` | `PULLS_REVIEW_PROVIDER`     | -                                                             | Else the first conventional key present, in Settings' priority (gateway > anthropic > openai-compatible). |
| -            | `PULLS_REVIEW_API_KEY`      | `AI_GATEWAY_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | The prefixed key applies to the selected provider.                                                        |
| `--model`    | `PULLS_REVIEW_MODEL`        | -                                                             | Else `defaultLlmSettings`' model for the provider.                                                        |
| -            | `PULLS_REVIEW_BASE_URL`     | `OPENAI_BASE_URL`                                             | `openai-compatible` only.                                                                                 |
| `--locale`   | `PULLS_REVIEW_LOCALE`       | -                                                             | Default `en`.                                                                                             |

Target: a positional `owner/repo#123` or github.com PR URL; otherwise
`GITHUB_REPOSITORY` + the `pull_request.number` in `GITHUB_EVENT_PATH`.

Behaviour (`packages/actions/src/run.ts`):

1. Fetch the diff, the token's login and the PR's shared-analysis comments in
   parallel. A token that cannot call `/user` (the workflow `GITHUB_TOKEN`) is
   `github-actions[bot]`, which is the author GitHub shows for it.
2. If the author's existing comment carries the PR's current `head.sha`, exit
   0 without a model call.
3. Otherwise analyze, render the Plan 07 comment body and PATCH the existing
   comment or POST a new one. One comment per author, same as the site.

## GitHub Action

`action.yml` at the repo root is a composite action running
`npx -y @pulls.review/actions@<version>` with the inputs mapped onto `PULLS_REVIEW_*`.
Blank inputs arrive as `''`, which the CLI treats as unset.

The README recommends `pull_request_target`: the CLI never checks out PR code
(it reads the diff through the API), so exposing secrets to the job is safe and
fork PRs get a comment too. `permissions: pull-requests: write` is required.

## Naming

`@pulls.review/actions` is only the CI entry point. The unscoped `pulls.review`
package is for the standalone CLI (local git inspection through devframe, built
on the `local` provider of Plan 04); it is not built yet.

## Publishing

Both `@pulls.review/core` and `@pulls.review/actions` are publishable; the CLI depends on
core as a normal dependency. The `@pulls.review` npm scope has to be claimed
before the first release. Releases require explicit human approval.

## Not in scope

- A `--force` to re-analyze an unchanged PR, `--dry-run`, or posting anything
  but the Plan 07 comment.
- Running the rule-based adapter from the CLI (only `llm` results are shareable).
- The `local` provider (Plan 04) - core is now where it would live.
