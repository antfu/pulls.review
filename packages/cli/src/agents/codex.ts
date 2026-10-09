import type { AgentCli, AgentCliEvent, AgentRunInput } from './types'
import * as v from 'valibot'
import { readVersion, spawnJsonLines } from './process'
import { assistantMessage, toolCall, toolResultMessage } from './types'

const Item = v.variant('type', [
  v.object({ type: v.literal('agent_message'), id: v.string(), text: v.string() }),
  v.object({ type: v.literal('reasoning'), id: v.string(), text: v.string() }),
  v.object({ type: v.literal('command_execution'), id: v.string(), command: v.string(), aggregated_output: v.string(), exit_code: v.nullable(v.number()), status: v.string() }),
])
const Line = v.variant('type', [
  v.object({ type: v.literal('thread.started'), thread_id: v.string() }),
  v.object({ type: v.literal('item.started'), item: Item }),
  v.object({ type: v.literal('item.completed'), item: Item }),
  v.object({ type: v.literal('turn.completed') }),
  v.object({ type: v.literal('turn.failed'), error: v.object({ message: v.string() }) }),
  v.object({ type: v.literal('error'), message: v.string() }),
])

function args({ model, resume }: AgentRunInput): string[] {
  // Parent exec options also apply to resume, whose own flags omit --sandbox.
  const list = ['exec', '--json', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '--skip-git-repo-check']
  if (model)
    list.push('--model', model)
  if (resume)
    list.push('resume', resume)
  list.push('-')
  return list
}

interface RunState {
  model: string
  lastText?: string
  errorText: string
  commands: Set<string>
}

function itemEvents(line: Extract<v.InferOutput<typeof Line>, { item: unknown }>, state: RunState): AgentCliEvent[] {
  const item = line.item
  if (item.type !== 'command_execution') {
    if (line.type !== 'item.completed')
      return []
    if (item.type === 'agent_message')
      state.lastText = item.text
    return [{ kind: 'message', message: assistantMessage('codex', state.model, [{ type: 'text', text: item.text }]) }]
  }
  const events: AgentCliEvent[] = []
  if (!state.commands.has(item.id)) {
    state.commands.add(item.id)
    events.push({ kind: 'message', message: assistantMessage('codex', state.model, [toolCall(item.id, 'shell', { command: item.command })]) })
  }
  if (line.type === 'item.completed')
    events.push({ kind: 'message', message: toolResultMessage(item.id, 'shell', item.aggregated_output, item.status === 'failed' || (item.exit_code !== null && item.exit_code !== 0)) })
  return events
}

function lineEvents(line: v.InferOutput<typeof Line>, state: RunState, model: string | undefined): AgentCliEvent[] {
  switch (line.type) {
    case 'thread.started':
      return [{ kind: 'session', id: line.thread_id, model }]
    case 'error':
      state.errorText = line.message
      return []
    case 'turn.failed':
      state.errorText = line.error.message
      return [{ kind: 'final', text: state.errorText, isError: true }]
    case 'turn.completed':
      return [{ kind: 'final', text: state.lastText }]
    default:
      return itemEvents(line, state)
  }
}

/** Codex exec persists threads in its own storage; JSONL carries the thread id, not the model. */
export const codex: AgentCli = {
  name: 'codex',
  label: 'Codex',
  detect: () => readVersion('codex'),
  models: async () => [],
  async* run(input): AsyncGenerator<AgentCliEvent> {
    const state: RunState = { model: input.model ?? 'default', errorText: '', commands: new Set() }
    for await (const event of spawnJsonLines('codex', args(input), { cwd: input.cwd, signal: input.signal, stdin: `${input.system}\n\n${input.prompt}` })) {
      if ('exit' in event) {
        if (event.exit.code !== 0 && !input.signal.aborted)
          yield { kind: 'final', text: state.errorText || event.exit.stderr, isError: true }
        yield { kind: 'exit', ...event.exit, sessionLost: /no (?:saved )?(?:session|conversation).*found|(?:session|thread|conversation).*not found|failed to (?:load|resume).*session/i.test(`${state.errorText}\n${event.exit.stderr}`) }
        return
      }
      const parsed = v.safeParse(Line, event.line)
      if (parsed.success)
        yield* lineEvents(parsed.output, state, input.model)
    }
  },
}
