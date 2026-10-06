import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { LlmSession } from '@pulls.review/core/cache'
import type { AgentRunOptions } from './run'
import { randomUUID } from 'node:crypto'
import { CLI_AGENT_CHAT_SECTION, toGroupedResult } from '@pulls.review/core/llm'
import { checkAnswer } from './analyze'
import { AgentRunError, parseJsonAnswer, runTurn, systemPromptFor, withoutJsonFence, writePatch } from './run'
import { toolResultMessage } from './types'

export interface AgentChatOptions extends AgentRunOptions {
  /** The transcript to continue; `agent` names the CLI session it lives in. */
  session: LlmSession
  /** The user's new message; absent re-sends the transcript's last user message (the chat's retry). */
  text?: string
}

function lastUserText(messages: AgentMessage[]): string | undefined {
  const last = messages.findLast(message => message.role === 'user')
  if (!last || last.role !== 'user')
    return undefined
  return typeof last.content === 'string' ? last.content : last.content.map(part => part.type === 'text' ? part.text : '').join('')
}

/** Drops the fenced grouping from the reply as shown; the notice that follows says what it did. */
function stripGrouping(transcript: AgentMessage[]) {
  const index = transcript.findLastIndex(message => message.role === 'assistant')
  const reply = transcript[index]
  if (!reply || reply.role !== 'assistant')
    return
  const content = reply.content
    .map(part => part.type === 'text' ? { ...part, text: withoutJsonFence(part.text) } : part)
    .filter(part => part.type !== 'text' || part.text)
  transcript[index] = { ...reply, content }
}

/**
 * Continues an agent CLI session with the reviewer's question. A fenced JSON grouping in
 * the reply is applied like `update_grouping`: validated, emitted as `result`, and noted
 * in the transcript; one that fails validation is noted as a tool error instead.
 */
export async function runAgentChat({ cli, model, diff, locale, cwd, patchDir, emit, signal, session, text }: AgentChatOptions): Promise<void> {
  const resume = session.agent
  if (!resume || resume.agent !== cli.name)
    throw new AgentRunError(`This conversation was not started with ${cli.label}. Re-analyze to chat with it.`)
  const message = text ?? lastUserText(session.messages)
  if (!message)
    throw new AgentRunError('Nothing to send.')

  const { patchPath, cleanup } = await writePatch(patchDir, randomUUID(), diff)
  try {
    const system = systemPromptFor(diff, patchPath, `\n\n${CLI_AGENT_CHAT_SECTION}`)
    const transcript: AgentMessage[] = text === undefined
      ? [...session.messages]
      : [...session.messages, { role: 'user', content: text, timestamp: Date.now() }]
    emit({ kind: 'messages', messages: [...transcript] })

    const outcome = await runTurn(cli, { cwd, system, prompt: message, model, resume: resume.id }, transcript, { emit, signal, cwd, model, step: 1 })
    const answer = parseJsonAnswer(outcome.final?.text)
    if (answer !== undefined) {
      stripGrouping(transcript)
      const checked = checkAnswer(diff, answer)
      if ('analysis' in checked) {
        const stamp = `${cli.name}/${outcome.session?.model ?? resume.model ?? model ?? 'default'}`
        emit({ kind: 'result', result: toGroupedResult(diff, checked.analysis, stamp, locale) })
        transcript.push(toolResultMessage('grouping', 'update_grouping', `Grouping updated: ${checked.analysis.groups.length} groups.`))
      }
      else {
        transcript.push(toolResultMessage('grouping', 'update_grouping', checked.fix, true))
      }
      emit({ kind: 'messages', messages: [...transcript] })
    }
    emit({ kind: 'end', stopReason: 'done', agent: outcome.session ?? resume })
  }
  finally {
    await cleanup()
  }
}
