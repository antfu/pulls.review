# Plan 11: analyze with a local agent CLI (`pulls.review` CLI)

Status: **proposed**. Builds on Plan 09 (the `pulls.review` server and the
`PR_LOCAL` build). Nothing here touches the site or `@pulls.review/actions`.

## Why

The site and the CLI analyze in the browser with an API key the user types into
Settings. On a developer machine that key usually already exists in another form:
a coding agent (`claude`, `codex`, `opencode`, `gemini`) signed in with a
subscription. Those agents also sit in the repository, so for a local target they
can open the full files the patch only hints at, not just the hunks.

The `pulls.review` server already runs on the user's machine as the user. Letting it
spawn one of those agents keeps every invariant: no backend of ours, no key of ours,
nothing proxied. It is opt-in - the provider picker in Settings - and the in-browser
path stays the default.

## What the user sees

- Settings, LLM section: a fourth provider, **Local agent**, next to AI Gateway,
  Anthropic and OpenAI-compatible. Inside it, where the other three show a key
  field, it shows an **agent** choice - the CLIs the server found on `PATH`
  (`Claude Code`, `Codex`, `OpenCode`, `Gemini CLI`), each with its version - and
  below it the same `ModelPicker` the other providers use, fed by that agent's
  model catalog, with "agent default" as the first entry. No key is asked for.
  With no agent found, the provider explains what it looks for and links the
  install pages. Outside the `PR_LOCAL` build (the site, the embed) the provider is
  shown disabled with a note that it needs the `pulls.review` CLI - the same way
  the embed shows the whole section disabled today.
- Analyze, the status modal, the result and the chat work as they do today. The
  transcript shows the agent's turns and the files it read. The result's model
  reads `claude-code/claude-sonnet-...` - the model the agent reports, else the
  one picked, else the agent's name alone.
- Chat follows up in the same agent session. A result cached without a session -
  one loaded from a shared comment, or one whose agent session the CLI has since
  deleted - says `Re-analyze to enable chat`, as today.
- A GitHub PR opened in the CLI (`/gh/...`) can be analyzed by an agent too. It
  gets the patch only, never the checkout, since the working tree may be another
  repository or ref.

## Design

### Where analysis runs

Today `createLlmStore` and `useLlmChat` call core's pi runtime directly. They gain
one seam, an `LlmRunner` on the app context (Plan 10), next to `cache` and
`credentials`:

```ts
interface LlmRunner {
  analyze: (diff: DiffsPayload, options: LlmAnalyzeOptions) => Promise<{ result: GroupedResult, transcript: AgentMessage[], session?: AgentSessionRef }>
  chat: (input: { diff: DiffsPayload, session: LlmSession, text?: string, signal: AbortSignal }, onMessages: (messages: AgentMessage[]) => void, onGroupingUpdate: (result: GroupedResult) => void) => Promise<AgentMessage[]>
}
```

- The site's runner is today's code, moved: `resolveModel(settings.llm)` and the
  pi `Agent` in the browser. The embed has no runner (`PR_LLM` off).
- The `PR_LOCAL` runner dispatches on `settings.llm.provider`: `local-agent` goes
  to the server over RPC (below); any other provider runs in the browser as
  before. `isSetup` reflects the same split: for `local-agent` it is "the chosen
  agent is in `agent.list`".
- Components do not change. `DiffsStoreLlm` keeps its shape; `transcript` and
  `chat.messages` stay pi `AgentMessage[]`, so `ChatMessage.vue`,
  `AnalyzeStatusModal.vue` and the `llmSession` cache schema are untouched.

### Settings

`LLM_PROVIDERS` gains `'local-agent'`, and `LlmSettings` two fields in the same
style as the other providers' `<provider>Model` keys:

```ts
agent: LocalAgentName | '' // '' until the user picks one
agentModel: string // '' = the agent's own default
```

`LocalAgentName` is `'claude' | 'codex' | 'opencode' | 'gemini'`, the adapter ids
below, defined in core so the settings, the RPC schemas and the server agree.
Switching agent resets `agentModel` to `''`, since one agent's model ids mean
nothing to another.

`resolveModel` returns `undefined` for `local-agent`, so every path that needs a
key stays "not configured" outside the `PR_LOCAL` build (Settings are per origin,
so a `localhost` choice never reaches the site). `llmToken` returns `''` for it
and `useLlmModels` skips it: its catalog comes from `agent.models`, not from a key.
`llmSettingsFromEnv` is unchanged: the agent is chosen in Settings only, per the
decision for this plan.

In `LlmSettingsSection.vue`, `providerOptions` gains the fourth entry and the
`local-agent` branch replaces the key field with an `ActionToggleGroup` of the
detected agents (label and version) and keeps the `ModelPicker` beneath it. The
agent list and the model catalog come through two small composables over the
RPC, provided by the `PR_LOCAL` build only; without them (the site, the embed)
the branch renders disabled with its note.

### Server (RPC)

New functions in `packages/cli/src/rpc.ts`, names in `core/local-rpc.ts`:

| Function        | Type   | Does                                                                                                                                                                    |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent.list`    | query  | The agent CLIs found on `PATH`, with versions: `{ name, label, version }[]`. Detection runs `<bin> --version` once per server start.                                    |
| `agent.models`  | query  | `{ agent }` → `ModelOption[]`, the agent's catalog (below). Cached per agent for the server's lifetime.                                                                 |
| `agent.analyze` | action | `{ agent, model, diff, locale }` → `{ streamId }`. Writes the patch, spawns the agent, streams events on the `pulls.review:agent` channel. Returns before the run ends. |
| `agent.chat`    | action | `{ agent, model, diff, session, text?, locale }` → `{ streamId }`. Resumes the agent session; `text` absent means "continue" (the chat's retry).                        |
| `agent.abort`   | action | `{ streamId }`. Kills the subprocess; the stream ends with `aborted`.                                                                                                   |

Streams use devframe's `ctx.rpc.streaming.create('pulls.review:agent')`; the browser
subscribes with `client.streaming.subscribe(channel, streamId)` and validates every
chunk with valibot. Chunks:

```ts
type AgentStreamEvent
  = | { kind: 'session', session: AgentSessionRef } // { agent, id, model? } - as soon as the CLI reports it
    | { kind: 'messages', messages: AgentMessage[] } // the live transcript so far, replaced each time
    | { kind: 'progress', progress: AnalyzeProgress } // thinking / reading [paths] / organizing
    | { kind: 'result', result: GroupedResult } // analyze: the accepted grouping; chat: an applied update_grouping
    | { kind: 'end', stopReason: 'done' | 'error' | 'aborted', error?: string }
```

The diff travels browser → server in `agent.analyze` because the server holds no
target (Plan 09) and a `/gh/...` diff only exists in the browser. The server never
sees the GitHub token.

### Agent adapters

`packages/cli/src/agents/<name>.ts`, one per CLI, behind one interface:

```ts
interface AgentCli {
  name: LocalAgentName
  label: string
  detect: () => Promise<string | undefined> // version, or undefined when not on PATH
  models: () => Promise<ModelOption[]> // the catalog; [] when the CLI has none to list
  run: (input: AgentRunInput) => AsyncIterable<AgentCliEvent> // one subprocess, start to exit
}
interface AgentRunInput {
  cwd: string // the repo for a local target; an empty temp dir for a GitHub one
  prompt: string
  model?: string // omitted = the agent's default
  schema?: JsonSchema // the final answer's shape, for CLIs that take one
  resume?: string // a session id to continue
  signal: AbortSignal
}
```

Each adapter spawns the CLI in its headless, streaming-JSON mode with read-only
tools, and maps the CLI's own event shapes into `AgentCliEvent`s: `session` (id,
model), `assistant` (text and tool-call parts), `toolResult` (tool name, is-error,
a short text), `final` (the last text or structured output), `exit` (code,
stderr tail). The mapping is the whole adapter; nothing else knows a CLI's output
format. Flags to start from, to be verified against each CLI's current `--help` in
the first task:

| CLI      | Headless                | Streaming events                        | Structured answer                | Resume                   | Read-only                                                            | Model                                                                                 |
| -------- | ----------------------- | --------------------------------------- | -------------------------------- | ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| claude   | `claude -p <prompt>`    | `--output-format stream-json --verbose` | `--json-schema <schema>`         | `--resume <id>`          | `--allowedTools Read Grep Glob` and `--disallowedTools` for the rest | `--model <alias or id>`; no list command: static catalog of `sonnet`, `opus`, `haiku` |
| codex    | `codex exec <prompt>`   | `--json`                                | `--output-schema <file>`         | `codex exec resume <id>` | `--sandbox read-only`                                                | `-m <id>`; no list command: static catalog                                            |
| opencode | `opencode run <prompt>` | `--format json`                         | parsed from the last fenced JSON | `--session <id>`         | `--agent plan`                                                       | `-m <provider/model>`; `opencode models` lists the signed-in catalog                  |
| gemini   | `gemini -p <prompt>`    | `--output-format stream-json`           | parsed from the last fenced JSON | to verify                | to verify                                                            | `-m <id>`; static catalog                                                             |

A CLI with no structured-output flag gets the JSON schema in the prompt and must end
with one fenced ` ```json ` block; the server parses the last one.

`models()` returns `ModelOption[]` (`id`, `name`, no pricing), so the picker
behaves as it does for Anthropic. A static catalog is a short list in the
adapter; where the CLI lists models, the adapter runs it once and parses the
output. An empty catalog falls the picker back to free-text entry, as a failed
fetch does today, so any id the CLI accepts can still be typed.

### The analysis run

`packages/cli/src/agents/analyze.ts` drives one adapter:

1. Write the patch (`renderFilesAsText` over every file) to
   `<git-common-dir>/pulls-review/agent/<streamId>.patch`; delete it on `end`.
2. Build the prompt from core's `AGENT_SYSTEM_PROMPT` and `buildAnalysisPrompt`,
   with two changes made in core so the browser prompt stays identical: the
   `read_diffs` paragraph becomes "the full patch is at `<path>`; open files in
   the repository when the hunks are not enough" (local target) or "the patch is
   all there is" (GitHub target), and the `submit_grouping` paragraph becomes
   "answer with the grouping as JSON matching the schema".
3. Translate `assistant` tool calls into `AnalyzeProgress`: `Read`/`Grep`/`Glob`
   (and the CLIs' equivalents) into `reading` with the paths read; plain text into
   `thinking`; the final answer into `organizing`.
4. Parse the final answer with `AnalysisSchema`, then `findCoverageIssues`. On
   issues, resume the session once with the same "Missing paths ... Fix these"
   message `submit_grouping` sends today, and parse again. A second miss ends the
   run with that message as the error, as `submitAttempts < 2` does today.
5. `toGroupedResult` takes the model as a string, so core's `ResolvedModel` is not
   needed for an agent result. The string is `<agent>/<model>`, where the model is
   the one the CLI reported in its `session` event, else `agentModel` from
   Settings, else `default`.

Timeouts: no agent turn cap is enforced here (the CLIs cap themselves); a run with
no event for 5 minutes is aborted as `error`.

### Chat

- `LlmSession` gains `agent?: AgentSessionRef`. `setSession` stores it with the
  transcript; `clear` keeps it (the agent session still holds the analysis context).
- `agent.chat` resumes the session with the user's text. The chat prompt appends
  the `update_grouping` rule: when the user asks to change the grouping, end with a
  fenced ` ```json ` grouping; otherwise, no JSON. The server validates a
  grouping with `findCoverageIssues`; a valid one is sent as `result` and the
  browser applies it through `onGroupingUpdate`, exactly as `update_grouping`
  does; an invalid one becomes an `isError` tool-result message so the chat shows
  the same error the browser path shows.
- Agent sessions live in the CLI's own storage. When resuming fails because the
  session is gone, the stream ends with `error: 'agent-session-lost'`; the
  diagnostic reads `The agent no longer has this conversation. Re-analyze to chat.`
  and the store drops `session.agent`, so the chat offers re-analyze.

### Trust and limits

- Only a trusted devframe client reaches `agent.*` (Plan 09). The agent runs as the
  user, in the user's repository, with read-only tools. Nothing writes but the patch
  file in the cache directory.
- The server passes no credentials to the agent: it inherits the user's shell
  environment, where its own login already is.
- One run per server at a time per agent; a second `agent.analyze` while one runs
  aborts the first (same as `reanalyze` in the browser).

## Testing

- **Adapters.** Each adapter's mapping is tested on recorded event streams (a
  fixture file per CLI, captured once with a real run) - no CLI on the test
  machine. A fixture is re-captured when a CLI changes its format.
- **Run.** The analysis and chat drivers run against a fake agent: a Node script
  on `PATH` that replays a fixture stream and records the arguments it got (prompt
  text, resume id, allow-list). This checks the prompt, the coverage retry, the
  grouping parse, abort, and the session-lost path.
- **RPC.** The `agent.*` functions run against the fake agent in the existing RPC
  integration test (temp repo, temp cache dir), subscribing to the stream.
- **Smoke.** One test per real CLI, skipped unless the binary is on `PATH`, runs a
  three-file diff and checks the grouping covers every path.

## Tasks

1. Verify each CLI's flags in the table (`--help`, one manual run each); fix the
   table. Decide whether gemini ships in the first version.
2. Core: `toGroupedResult(diff, analysis, model: string, locale)`; the prompt's two
   agent variants; `LocalAgentName`, the `local-agent` provider and the `agent` /
   `agentModel` settings; `LlmSession.agent`; the `AgentStreamEvent` and
   `AgentSessionRef` schemas and `agent.*` names in `local-rpc.ts`.
3. App: `LlmRunner` on the app context; the browser runner (moved code);
   `createLlmStore` and `useLlmChat` call the runner. No behaviour change on the
   site - the existing store and chat tests pass unchanged.
4. CLI: adapter interface, `claude` adapter (with its static catalog) and the fake
   agent, the analysis driver with the coverage retry, `agent.list` /
   `agent.models` / `agent.analyze` / `agent.abort`.
5. App: the **Local agent** provider in `LlmSettingsSection.vue` - agent toggle
   group and model picker over the two RPC composables, disabled with a note
   outside `PR_LOCAL`; the `PR_LOCAL` RPC runner.
6. Chat: `agent.chat`, the grouping rule in the chat prompt, session-lost.
7. Adapters for `codex`, `opencode` (and `gemini` if kept), each with a fixture
   and its catalog (`opencode models` parsed; the others static).
8. Docs: `01-architecture.md` (the `LlmRunner` seam, the agent provider), Plan 09's
   "env LLM keys over RPC" line, the CLI README.

## Out of scope

- A CLI flag or environment variable to pick the agent (Settings only).
- Running the pi loop server-side with environment keys (the "env LLM keys over
  RPC" item of Plan 09). The `LlmRunner` seam makes it a small follow-up.
- Local models (Ollama, LM Studio): already reachable through the
  OpenAI-compatible provider; the only gap is pi-ai rejecting an empty API key.
- Agents in `@pulls.review/actions` (CI has keys), and in the `build` snapshot.
- Letting the agent comment on GitHub or edit files.
