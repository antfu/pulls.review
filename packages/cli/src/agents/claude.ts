import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { AgentCli, AgentCliEvent, AgentRunInput } from './types'
import { analysisJsonSchema } from '@pulls.review/core/llm'
import * as v from 'valibot'
import { readVersion, spawnJsonLines } from './process'
import { assistantMessage, toolCall, toolResultMessage } from './types'

/** Claude Code aliases; any full model id can still be typed. */
const MODELS = [
  { id: 'sonnet', name: 'Sonnet (latest)' },
  { id: 'opus', name: 'Opus (latest)' },
  { id: 'haiku', name: 'Haiku (latest)' },
]

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob']
const WRITE_TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task']

/** `claude -p --output-format stream-json --verbose`: one JSON object per line, these shapes. */
const Text = v.object({ type: v.literal('text'), text: v.string() })
const Content = v.variant('type', [
  Text,
  v.object({ type: v.literal('tool_use'), id: v.string(), name: v.string(), input: v.unknown() }),
  v.object({
    type: v.literal('tool_result'),
    tool_use_id: v.string(),
    content: v.optional(v.union([v.string(), v.array(v.union([Text, v.looseObject({ type: v.string() })]))])),
    is_error: v.optional(v.boolean()),
  }),
])
const Line = v.variant('type', [
  v.object({ type: v.literal('system'), subtype: v.string(), session_id: v.string(), model: v.optional(v.string()) }),
  v.object({ type: v.literal('assistant'), message: v.object({ content: v.array(Content), model: v.optional(v.string()) }) }),
  v.object({ type: v.literal('user'), message: v.object({ content: v.union([v.string(), v.array(Content)]) }) }),
  v.object({ type: v.literal('result'), is_error: v.boolean(), result: v.optional(v.string()), structured_output: v.optional(v.unknown()), session_id: v.string() }),
])
type ClaudeLine = v.InferOutput<typeof Line>

function textOf(content: string | { type: string, text?: unknown }[] | undefined): string {
  if (typeof content === 'string')
    return content
  return (content ?? []).map(part => typeof part.text === 'string' ? part.text : '').join('')
}

/** Claude validates the answer itself against the grouping schema, so `final.structured` is already parsed. */
function args({ system, model, resume }: AgentRunInput): string[] {
  const list = ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', system, '--permission-mode', 'dontAsk', '--allowedTools', ...READ_ONLY_TOOLS, '--disallowedTools', ...WRITE_TOOLS, '--json-schema', JSON.stringify(analysisJsonSchema())]
  if (model)
    list.push('--model', model)
  if (resume)
    list.push('--resume', resume)
  return list
}

/** Maps one stream line; `toolNames` remembers each call's tool for the result that follows. */
function mapLine(line: ClaudeLine, model: string, toolNames: Map<string, string>): AgentCliEvent[] {
  switch (line.type) {
    case 'system':
      return line.subtype === 'init' ? [{ kind: 'session', id: line.session_id, model: line.model }] : []
    case 'assistant': {
      const content: AssistantMessage['content'] = []
      for (const part of line.message.content) {
        if (part.type === 'text') {
          content.push({ type: 'text', text: part.text })
        }
        else if (part.type === 'tool_use') {
          toolNames.set(part.id, part.name)
          content.push(toolCall(part.id, part.name, part.input))
        }
      }
      return content.length ? [{ kind: 'message', message: assistantMessage('claude', line.message.model ?? model, content) }] : []
    }
    case 'user':
      if (typeof line.message.content === 'string')
        return []
      return line.message.content.flatMap(part => part.type === 'tool_result'
        ? [{ kind: 'message', message: toolResultMessage(part.tool_use_id, toolNames.get(part.tool_use_id) ?? 'tool', textOf(part.content), part.is_error ?? false) }]
        : [])
    case 'result':
      return [{ kind: 'final', text: line.result, structured: line.structured_output, isError: line.is_error }]
  }
}

export const claude: AgentCli = {
  name: 'claude',
  label: 'Claude Code',
  detect: () => readVersion('claude'),
  models: async () => MODELS,
  async* run(input: AgentRunInput): AsyncGenerator<AgentCliEvent> {
    let model = input.model ?? 'claude'
    const toolNames = new Map<string, string>()
    for await (const item of spawnJsonLines('claude', args(input), { cwd: input.cwd, signal: input.signal, stdin: input.prompt })) {
      if ('exit' in item) {
        yield { kind: 'exit', ...item.exit, sessionLost: /No conversation found/i.test(item.exit.stderr) }
        return
      }
      const parsed = v.safeParse(Line, item.line)
      if (!parsed.success)
        continue
      for (const event of mapLine(parsed.output, model, toolNames)) {
        if (event.kind === 'session' && event.model)
          model = event.model
        yield event
      }
    }
  },
}
