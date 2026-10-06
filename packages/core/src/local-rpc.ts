import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentSessionRef, AnalyzeProgress, GroupedResult } from './types/analyze'
import * as v from 'valibot'
import { LOCAL_AGENT_NAMES } from './analyze/adapters/llm/settings'
import { AgentSessionRefSchema, AnalyzeProgressSchema, GroupedResultSchema } from './types/analyze'

/**
 * The contract between the `pulls.review` devframe server (`packages/cli`) and the
 * `PR_LOCAL` app build: the devframe id, where it mounts, and its RPC function names.
 * Browser-safe; both sides import it so the names can't drift.
 */
export const LOCAL_DEVFRAME_ID = 'pulls.review'

/** Where a devframe hub mounts it (`/__<id>/`); standalone, it serves at `/`. */
export const LOCAL_HUB_BASE_PATH = '/__pulls.review/'

/** Bare names; devframe namespaces them as `pulls.review:<name>`. */
export const LOCAL_RPC = {
  /** Branches, tags, recent commits and the default branch, for the ref picker. */
  repoInfo: 'repo-info',
  sourceKey: 'source-key',
  sourceFetch: 'source-fetch',
  sourceFingerprint: 'source-fingerprint',
  sourceLoadFile: 'source-load-file',
  /** An unstorage driver over the server's cache directory. */
  storageGetItem: 'storage-get-item',
  storageSetItem: 'storage-set-item',
  storageRemoveItem: 'storage-remove-item',
  storageGetKeys: 'storage-get-keys',
  githubToken: 'github-token',
  /** Analysis and chat through a local agent CLI (`plans/11-local-agents.md`). */
  agentList: 'agent-list',
  agentModels: 'agent-models',
  agentAnalyze: 'agent-analyze',
  agentChat: 'agent-chat',
  agentAbort: 'agent-abort',
} as const

/** The streaming channel `agent-analyze` and `agent-chat` write to; devframe namespaces it too. */
export const LOCAL_AGENT_CHANNEL = 'agent'

export const LocalAgentInfoSchema = v.object({
  name: v.picklist(LOCAL_AGENT_NAMES),
  label: v.string(),
  version: v.string(),
})
export type LocalAgentInfo = v.InferOutput<typeof LocalAgentInfoSchema>

/** A pi `AgentMessage` as it crosses the wire; the browser treats it as one. */
const TranscriptMessageSchema = v.looseObject({ role: v.string() })

export const AgentStreamEventSchema = v.variant('kind', [
  v.object({ kind: v.literal('session'), session: AgentSessionRefSchema }),
  /** The live transcript so far, replaced each time. */
  v.object({ kind: v.literal('messages'), messages: v.array(TranscriptMessageSchema) }),
  v.object({ kind: v.literal('progress'), progress: AnalyzeProgressSchema }),
  /** Analysis: the accepted grouping. Chat: an applied grouping update. */
  v.object({ kind: v.literal('result'), result: GroupedResultSchema }),
  v.object({
    kind: v.literal('end'),
    stopReason: v.picklist(['done', 'error', 'aborted']),
    error: v.optional(v.string()),
    /** `agent-session-lost`: the CLI no longer has the conversation to resume. */
    code: v.optional(v.string()),
  }),
])
/** The schema's output with the messages as the pi type they are; the browser parses then treats them so. */
export type AgentStreamEvent
  = | { kind: 'session', session: AgentSessionRef }
    | { kind: 'messages', messages: AgentMessage[] }
    | { kind: 'progress', progress: AnalyzeProgress }
    | { kind: 'result', result: GroupedResult }
    | { kind: 'end', stopReason: 'done' | 'error' | 'aborted', error?: string, code?: string }

export const AGENT_SESSION_LOST = 'agent-session-lost'
