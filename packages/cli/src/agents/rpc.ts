import type { LlmSession } from '@pulls.review/core/cache'
import type { AgentStreamEvent } from '@pulls.review/core/local-rpc'
import type { AgentChatOptions } from './chat'
import type { AgentRunOptions } from './run'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCAL_AGENT_NAMES } from '@pulls.review/core/analyze'
import { AGENT_SESSION_LOST, LOCAL_RPC, LocalAgentInfoSchema } from '@pulls.review/core/local-rpc'
import { LOCALES } from '@pulls.review/core/locales'
import { AgentSessionRefSchema, DiffsPayloadSchema } from '@pulls.review/core/types'
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { runAgentAnalysis } from './analyze'
import { runAgentChat } from './chat'
import { agents, detectAgents } from './index'
import { AgentRunError } from './run'

/** The part of devframe's `RpcStreamingChannel` the agent functions use. */
export interface AgentChannel {
  start: () => {
    id: string
    signal: AbortSignal
    write: (event: AgentStreamEvent) => void
    close: () => void
  }
}

export interface AgentRpcOptions {
  /** The repository under review: where a local diff's agent runs. */
  cwd: string
  /** Where patches are written for the agent (under the repo's cache dir). */
  patchDir: string
  channel: AgentChannel
}

const agentName = v.picklist(LOCAL_AGENT_NAMES)
const locale = v.picklist(LOCALES.map(entry => entry.code))
const AnalyzeArgs = v.object({ agent: agentName, model: v.optional(v.string()), diff: DiffsPayloadSchema, locale })
const ChatArgs = v.object({
  ...AnalyzeArgs.entries,
  session: v.object({ messages: v.array(v.looseObject({ role: v.string() })), chatStartIndex: v.number(), agent: v.optional(AgentSessionRefSchema) }),
  text: v.optional(v.string()),
})

/** `agent.*`: analysis and chat through a local agent CLI, streamed on `channel` (`plans/11-local-agents.md`). */
export function agentRpcFunctions({ cwd, patchDir, channel }: AgentRpcOptions) {
  const running = new Map<string, AbortController>()
  let detected: Promise<v.InferOutput<typeof LocalAgentInfoSchema>[]> | undefined

  /** Starts `run` on a fresh stream and returns its id at once; the stream carries the outcome. */
  function start(args: v.InferOutput<typeof AnalyzeArgs>, run: (options: AgentRunOptions) => Promise<void>): { streamId: string } {
    const sink = channel.start()
    const controller = new AbortController()
    running.set(sink.id, controller)
    // Every subscriber gone (the tab closed) ends the run too.
    sink.signal.addEventListener('abort', () => controller.abort())

    void (async () => {
      // A GitHub diff is analyzed from its patch alone, in a scratch dir, not in whatever is checked out here.
      const local = args.diff.ref.kind === 'local'
      const scratch = local ? undefined : await mkdtemp(join(tmpdir(), 'pulls-review-agent-'))
      try {
        await run({
          cli: agents[args.agent],
          model: args.model || undefined,
          diff: args.diff,
          locale: args.locale,
          cwd: scratch ?? cwd,
          patchDir,
          emit: event => sink.write(event),
          signal: controller.signal,
        })
      }
      catch (error) {
        if (controller.signal.aborted)
          sink.write({ kind: 'end', stopReason: 'aborted' })
        else if (error instanceof AgentRunError)
          sink.write({ kind: 'end', stopReason: 'error', error: error.message, code: error.code === AGENT_SESSION_LOST ? error.code : undefined })
        else
          sink.write({ kind: 'end', stopReason: 'error', error: error instanceof Error ? error.message : String(error) })
      }
      finally {
        running.delete(sink.id)
        sink.close()
        if (scratch)
          await rm(scratch, { recursive: true, force: true })
      }
    })()
    return { streamId: sink.id }
  }

  return [
    defineRpcFunction({
      name: LOCAL_RPC.agentList,
      type: 'query',
      args: [],
      returns: v.array(LocalAgentInfoSchema),
      handler: () => detected ??= detectAgents(),
    }),
    defineRpcFunction({
      name: LOCAL_RPC.agentAnalyze,
      type: 'query',
      args: [AnalyzeArgs],
      returns: v.object({ streamId: v.string() }),
      handler: args => start(args, runAgentAnalysis),
    }),
    defineRpcFunction({
      name: LOCAL_RPC.agentChat,
      type: 'query',
      args: [ChatArgs],
      returns: v.object({ streamId: v.string() }),
      // The wire validates messages loosely (`local-rpc.ts`); they are the pi messages the browser stored.
      handler: ({ session, text, ...args }) => start(args, options => runAgentChat({ ...options, session: session as LlmSession, text } satisfies AgentChatOptions)),
    }),
    defineRpcFunction({
      name: LOCAL_RPC.agentAbort,
      type: 'action',
      args: [v.object({ streamId: v.string() })],
      returns: v.void(),
      handler: ({ streamId }) => {
        running.get(streamId)?.abort()
      },
    }),
  ]
}
