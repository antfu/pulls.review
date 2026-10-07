# Plan 06: Agent-driven LLM analysis and follow-up chat

## Scope

Replace the `llm` adapter's chunk → parallel → merge → synthesis pipeline with a
single tool-calling agent built on `@earendil-works/pi-agent-core`, then reuse the
agent's transcript for a follow-up chat that can answer questions about the PR and
regroup its files.

### Problem

Large PRs are split into ~60k-char chunks in file order and analyzed in parallel,
blind to each other. Groups are then merged only when keys match exactly, and the
synthesis pass sees no diff text, so it cannot regroup. A single feature spanning
2-3 modules routinely comes out as a dozen-plus fragmented groups. Failures are
also hidden: `catch {}` silently returns rule-based output, which is then cached as
the `llm` result.

### Success criteria

- A PR implementing one feature across 2-3 modules yields 2-5 top-level groups.
- Every changed path appears in exactly one group or child.
- The user sees step-by-step progress while the agent runs.
- Analysis failures are visible; they never masquerade as an `llm` result.
- After analysis, the user can ask follow-up questions and ask for a regroup.

## Decisions

| Topic           | Decision                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Agent runtime   | `@earendil-works/pi-agent-core` on `@earendil-works/pi-ai`, replacing the AI SDK for analysis and chat  |
| Agent context   | This PR's `DiffsPayload` only; no repository file reads                                                 |
| Progress        | Shown in the header while analyzing                                                                     |
| Tests placement | Tests, stories, fixtures go with the feature they cover                                                 |
| Output language | `settings.locale`, named in the last line of the English user prompt (chat: follows the user's message) |
| Chat placement  | Floating widget, bottom-right                                                                           |
| Chat capability | Q&A plus regrouping via a tool                                                                          |
| Persistence     | Transcript and chat stored in the existing `pr-cache` IndexedDB entry                                   |

## Provider mapping (`llm/model.ts`)

`resolveLanguageModel()` becomes `resolveModel(): { model: Model<Api>, apiKey: string } | undefined`,
building pi-ai custom `Model` objects from Settings. The runtime side (`llm/runtime.ts`, only imported by `agent.ts`/`chat.ts`) registers them through `createModels()` + `createProvider()` with the `api/<id>.lazy` implementations and passes `models.streamSimple` as the loop's `streamFn`; the API key is passed per request:

| Setting             | `api`                | `baseUrl`                                                                                                     |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `gateway`           | `anthropic-messages` | `https://ai-gateway.vercel.sh` (same as pi-ai's built-in `vercel-ai-gateway` models)                          |
| `anthropic`         | `anthropic-messages` | `https://api.anthropic.com`; pi-ai's anthropic-messages API sends `anthropic-dangerous-direct-browser-access` |
| `openai-compatible` | `openai-completions` | `settings.llm.openaiBaseUrl`                                                                                  |

`contextWindow`/`maxTokens`/`cost` use conservative constants (128k / 16k / 0);
they are not used for billing here.

`list-models.ts` keeps using `@ai-sdk/gateway` for the gateway catalog; `ai`,
`@ai-sdk/anthropic` and `@ai-sdk/openai-compatible` are gone.

### Bundle size

pi-ai's core entry is side-effect free and skips the model catalogs, but pi-agent-core's entry carries its harness. `llm/index.ts` MUST
load `agent.ts` and `chat.ts` via dynamic `import()` so the code is fetched only on
the first "Analyze with AI" click or chat open. The embed bundle MUST NOT grow:
its `inlineDynamicImports` would inline those `import()`s too, so they (and the
model-catalog fetch) sit behind the compile-time `import.meta.env.PR_LLM` flag,
which `vite.config.embed.ts` defines as `false` and enforces by failing the build
on any bundled LLM SDK module.
The `api/<id>.lazy` wrappers keep provider SDKs in their own chunks. Never import `providers/all` or `compat`.

## Analysis agent (`llm/agent.ts`)

`runAgent(diff, resolved, { onProgress, signal }): Promise<{ analysis: Analysis, transcript: AgentMessage[] }>`
uses the low-level `runAgentLoop()`; the system prompt is the leading `role: 'system'` message of the context.

### First user message (`buildAnalysisPrompt` in `prompt.ts`)

```
PR title: <title>
PR link: <url>
---DESCRIPTION---
<description>
---MANIFEST--- (<n> files, +<a>/-<d>)
app/auth/
  magic-link.ts        A +120      @@ export function sendMagicLink
  session.ts           M +18/-4    @@ class Session / @@ function refresh
pnpm-lock.yaml         M +300/-20  [generated]
---DIFFS--- (all diffs included; you may submit directly)
<renderFilesAsText(all files)>
```

- The manifest is a directory tree with status letter, line counts, at most 3 hunk
  headers per file, and `[generated]` / `[binary]` tags.
- `---DIFFS---` is included only when `renderFilesAsText(diff.files)` is ≤ 200,000 chars (about 50k tokens).

### System prompt (`AGENT_SYSTEM_PROMPT`)

Static text (cache-friendly), four sections:

- `<role>`: organize a PR's changed files into review groups so a reviewer reads it
  feature by feature.
- `<grouping_principles>`:
  - Group by intent, not directory. One feature across modules is ONE group.
  - Keep groups flat: `children` only for a group of more than 15 files that
    splits into clearly distinct sub-areas; no single-file children, no group
    with only one child.
  - Fewest groups that still separate independent intents; typically 1-5
    groups.
  - Tests, stories and fixtures usually go in a group of their own, separate
    from the code they cover.
  - Order by review priority: core change first, supporting changes next,
    mechanical changes (lockfiles, generated, formatting) last.
  - Every manifest path goes into exactly one group or child.
- `<workflow>`: hypothesize from the manifest; call `read_diffs` only where
  uncertain, batching paths; never read generated/lockfile paths; call
  `submit_grouping` once; if it errors, fix exactly what it names and resubmit.
- `<output>`: summaries explain why over what, 1-3 sentences of Markdown; `key`
  kebab-case; `label` at most 4 words; write summaries in the language named at
  the end of the user message (`Respond and categorize in <language>.`).

### Tools (`llm/tools.ts`)

Tool parameters are JSON Schema generated from valibot (`toJsonSchema`); `execute`
re-validates with valibot.

- `read_diffs({ paths: string[] })`
  - Unknown path → throw (pi reports it to the model as `isError`).
  - Path already in `ledger.readPaths` → `(already shown above)`.
  - Returns `renderFilesAsText` output, capped at 40,000 chars per call; files past
    the cap are listed as `not returned, request again`.
  - `details: { paths, chars }` feeds progress and the budget; not sent to the LLM.
- `submit_grouping({ overallSummary, groups })` (schema: `AnalysisSchema`)
  - Coverage check: any missing, duplicated, or unknown path → throw with the
    offending paths listed.
  - On the second failed submission, accept it as-is; `reconcile()` repairs it.
  - On success, store the result and return `terminate: true`.

### Message engine

A per-run `ledger`: `{ turn, charsRead, readPaths: Set<string>, submitAttempts, result }`.

| Hook                  | Behavior                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `getSteeringMessages` | Once, when `charsRead > 200_000` or `turn >= 10`: inject `Reading budget exhausted. Call submit_grouping now with what you have.` |
| `finishTurn`          | `{ action: 'end' }` when `ledger.result` is set or `turn >= 12` (skip error/aborted turns)                                        |
| `convertToLlm`        | Keep `user`, `assistant`, `toolResult`; no custom message types                                                                   |
| `transformContext`    | None (the budget bounds context size)                                                                                             |
| Caching               | Pass `sessionId` and `cacheRetention: 'short'`                                                                                    |

After the loop: if the last assistant message has `stopReason: 'error'`, throw its
`errorMessage`. If `ledger.result` is unset, throw `Agent did not submit a grouping`.

### Progress

`app/types/analyze.ts`:

```ts
export interface AnalyzeProgress { step: number, message: string }
analyze: (diff: DiffsPayload, options?: { onProgress?: (progress: AnalyzeProgress) => void, signal?: AbortSignal }) => Promise<GroupedResult>
```

Other adapters ignore `options`.

| Event                                    | `message`                               |
| ---------------------------------------- | --------------------------------------- |
| `turn_start`                             | `Thinking… (step n)`                    |
| `tool_execution_start` `read_diffs`      | `Reading 3 files: src/auth/login.ts, …` |
| `tool_execution_start` `submit_grouping` | `Organizing groups…`                    |

## Follow-up chat

### Data

`PrCacheEntry.llmSession?: { messages: AgentMessage[], chatStartIndex: number }`

- `messages` is the analysis transcript followed by chat messages; the UI renders
  from `chatStartIndex`.
- Included in `computeEntrySizeBytes`, so it takes part in budget eviction.
- Replaced on Re-analyze; dropped when `analyzeAndStore` rebuilds the entry (new
  commits, refresh).

### Engine (`llm/chat.ts`)

- pi `Agent` with `initialState.messages = llmSession.messages`, the same model
  resolution, and a system prompt of `AGENT_SYSTEM_PROMPT` plus a chat section:
  answer questions about this PR; call `update_grouping` only when the user asks to
  change the grouping; reply in the language of the user's message.
- Tools: `read_diffs` (shared) and `update_grouping` (same schema and coverage check
  as `submit_grouping`, no `terminate`). On success it replaces `analyzedBy.llm`
  in the store and cache and appends a notice (`Updated grouping: n groups`). No undo;
  Re-analyze resets.
- `transformContext`: when serialized context exceeds 400,000 chars, replace the
  oldest `read_diffs` result contents with `(diff omitted, call read_diffs again if needed)`,
  keeping tool call/result pairs intact.
- At most 8 turns per user message: `finishTurn` returns `{ action: 'end' }` once the count for the current message reaches 8.
- Stream `message_update` `text_delta` into the pending reply.
- Model switches between messages rely on pi-ai's cross-provider handoff.

### Store

`DiffsStoreLlm` gains:

```ts
interface DiffsStoreLlm {
  readonly progress: AnalyzeProgress | undefined
  readonly error: Error | undefined
  readonly chat: {
    readonly available: boolean
    readonly messages: AgentMessage[]
    readonly isStreaming: boolean
    readonly error: Error | undefined
    send: (text: string) => Promise<void>
    retry: () => Promise<void>
    stop: () => void
    clear: () => Promise<void>
  }
}
```

`chat.available` is true when `llmSession` exists. `clear()` truncates `messages`
back to `chatStartIndex`. The bridge lives in `composables/useLlmChat.ts`;
`mock-diffs-store.ts` gets matching mock fields.

### UI

- `DiffsHeader.vue`: the button label stays `Analyzing…`; `progress.message` is
  shown beside it (`text-xs op-mute truncate max-w-64`). `llm.error` is shown in
  red text (`AI analysis failed: <message>`); clicking the button retries.
- `components/chat/ChatWidget.vue`: rendered by `DiffsPage.vue` when
  `store.llm?.hasAiResult`. Collapsed: round button bottom-right. Expanded: ~400×560
  panel with message list, input, Stop, and Clear. Without `llmSession` (results
  cached before this plan) it shows `Re-analyze to enable chat`.
- `components/chat/ChatMessage.vue`: user/assistant bubbles; assistant text via
  the existing `Markdown` component; tool calls as a one-line muted notice; errors
  in red with Retry; stopped replies tagged `stopped`.

## Error handling

- `llm/index.ts` drops its `catch {}` fallback; the adapter throws.
- `runAnalysis` catches it into `llm.error`, leaves `analyzedBy.llm` untouched, so
  the view keeps showing the prior result or rule-based grouping. No rule-based
  output is ever stored under `llm`.
- Unmount or PR switch aborts the run via `AbortController`; abort is not an error.
- Chat errors render inline; Retry calls `agent.continue()`.

## Files

| File                                                              | Change                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `app/analyze/adapters/llm/model.ts`                               | Rewrite to pi-ai `Model`                                     |
| `app/analyze/adapters/llm/runtime.ts`                             | New: pi-ai `Models` + provider registration, `streamFn`      |
| `app/analyze/adapters/llm/agent.ts`                               | New                                                          |
| `app/analyze/adapters/llm/chat.ts`                                | New                                                          |
| `app/analyze/adapters/llm/tools.ts`                               | New                                                          |
| `app/analyze/adapters/llm/prompt.ts`                              | Agent prompt + manifest; drop chunk/synthesis prompts        |
| `app/analyze/adapters/llm/schema.ts`                              | Keep `AnalysisSchema` only                                   |
| `app/analyze/adapters/llm/index.ts`                               | Lazy-load agent; remove fallback                             |
| `chunk.ts`, `merge.ts`, `valibot-schema.ts` + tests               | Delete                                                       |
| `app/types/analyze.ts`                                            | `AnalyzeProgress`, `analyze` options                         |
| `app/cache/pr-cache.ts`                                           | `llmSession` field, size accounting, setter                  |
| `app/stores/types.ts`, `diffs-store.ts`, `mock-diffs-store.ts`    | progress, error, chat                                        |
| `app/composables/useLlmChat.ts`                                   | New                                                          |
| `app/components/diff/DiffsHeader.vue`, `DiffsPage.vue`            | Progress, error, mount widget                                |
| `app/components/chat/ChatWidget.vue`, `ChatMessage.vue` + stories | New                                                          |
| `package.json`                                                    | Add `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` |
| `.agents/01-architecture.md`                                      | Describe the agent pipeline and chat                         |

## Testing

All with vitest and pi-ai's `fauxProvider()`; no real API calls.

- `prompt.ts`: manifest snapshots over the three existing fixtures (replacing the
  current prompt snapshots).
- `tools.ts`: `read_diffs` unknown path, duplicate read, 40k cap; coverage check for
  missing, duplicate, unknown paths; second failed submit accepted.
- `agent.ts`: read → submit; invalid submit → corrected; budget steering injected
  once; no submit by turn 12 throws; `stopReason: 'error'` throws.
- `chat.ts`: `update_grouping` replaces the result; `transformContext` omits oldest
  diffs over the threshold.
- `diffs-store`: failed analysis sets `llm.error` and leaves `analyzedBy.llm` unchanged.
- `pr-cache`: `llmSession` counts toward `sizeBytes`; dropped on entry rebuild.
- Storybook: header analyzing and error states; ChatWidget collapsed, conversation,
  streaming, error.
- Manual: one real feature PR (e.g. the `vuejs-core-12349` fixture) goes from the
  current fragmented output to 2-5 top-level groups.

## Out of scope

- Reading repository files beyond the diff.
- Undo for chat regrouping.
- Removing `ai` / `@ai-sdk/*` (follow-up once `list-models.ts` moves off it).
- Chat in the embedded view (`store.llm` is undefined there).
- `web-llm`; see [`03-web-llm-analyze-adapter.md`](./03-web-llm-analyze-adapter.md).
