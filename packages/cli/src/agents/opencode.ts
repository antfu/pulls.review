import type { ModelOption } from '@pulls.review/core/llm'
import type { AgentCli, AgentCliEvent, AgentRunInput } from './types'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as v from 'valibot'
import { readVersion, spawnJsonLines } from './process'
import { assistantMessage, toolCall, toolResultMessage } from './types'

/** `opencode run --format json`: one event per line, each a part of the assistant's message. */
const Part = v.variant('type', [
  v.object({ type: v.literal('text'), text: v.string() }),
  v.object({
    type: v.literal('tool'),
    tool: v.string(),
    callID: v.string(),
    state: v.object({ status: v.string(), input: v.optional(v.unknown()), output: v.optional(v.string()), error: v.optional(v.string()) }),
  }),
  v.object({ type: v.literal('step-start') }),
  v.object({ type: v.literal('step-finish') }),
])
const Line = v.object({ type: v.string(), sessionID: v.optional(v.string()), part: v.optional(Part) })

/** `opencode models` prints one `provider/model` id per line; the signed-in providers only. */
async function listModels(): Promise<ModelOption[]> {
  const { stdout } = await promisify(execFile)('opencode', ['models'], { maxBuffer: 1024 * 1024 })
  return stdout.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('{')).map(id => ({ id, name: id }))
}

function args({ model, resume }: AgentRunInput): string[] {
  // `run` has no system prompt flag, and the `plan` agent is the read-only one.
  const list = ['run', '--format', 'json', '--agent', 'plan']
  if (model)
    list.push('--model', model)
  if (resume)
    list.push('--session', resume)
  return list
}

function mapPart(part: v.InferOutput<typeof Part>, model: string): AgentCliEvent[] {
  if (part.type === 'text')
    return [{ kind: 'message', message: assistantMessage('opencode', model, [{ type: 'text', text: part.text }]) }]
  if (part.type !== 'tool')
    return []
  const failed = part.state.status === 'error'
  return [
    { kind: 'message', message: assistantMessage('opencode', model, [toolCall(part.callID, part.tool, part.state.input)]) },
    { kind: 'message', message: toolResultMessage(part.callID, part.tool, failed ? part.state.error ?? 'failed' : part.state.output ?? '', failed) },
  ]
}

export const opencode: AgentCli = {
  name: 'opencode',
  label: 'OpenCode',
  detect: () => readVersion('opencode'),
  models: () => listModels().catch(() => []),
  async* run(input: AgentRunInput): AsyncGenerator<AgentCliEvent> {
    const { cwd, system, prompt, model, signal } = input
    let session: string | undefined
    let lastText: string | undefined
    for await (const item of spawnJsonLines('opencode', args(input), { cwd, signal, stdin: `${system}\n\n${prompt}` })) {
      if ('exit' in item) {
        if (item.exit.code === 0)
          yield { kind: 'final', text: lastText }
        yield { kind: 'exit', ...item.exit, sessionLost: /Session not found/i.test(item.exit.stderr) }
        return
      }
      const parsed = v.safeParse(Line, item.line)
      if (!parsed.success)
        continue
      const { sessionID, part } = parsed.output
      if (sessionID && sessionID !== session) {
        session = sessionID
        yield { kind: 'session', id: sessionID }
      }
      if (part?.type === 'text')
        lastText = part.text
      if (part)
        yield* mapPart(part, model ?? 'opencode')
    }
  },
}
