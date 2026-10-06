import type { AgentStreamEvent } from '@pulls.review/core/local-rpc'
import type { DiffsPayload } from '@pulls.review/core/types'
import type { AgentChannel } from './rpc'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFakeAgents } from '../../test/fake-agents'
import { agentRpcFunctions } from './rpc'

/** A channel whose streams collect into memory, resolving when closed. */
function memoryChannel() {
  const streams = new Map<string, { events: AgentStreamEvent[], done: Promise<void> }>()
  let next = 0
  const channel: AgentChannel = {
    start() {
      const id = `stream-${++next}`
      const events: AgentStreamEvent[] = []
      let close!: () => void
      const done = new Promise<void>(resolve => close = resolve)
      streams.set(id, { events, done })
      return { id, signal: new AbortController().signal, write: event => events.push(event), close }
    },
  }
  return { channel, stream: (id: string) => streams.get(id)! }
}

const diff: DiffsPayload = {
  ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' },
  title: 'Add the thing',
  files: [
    { path: 'a.ts', sha: 'a1', status: 'added', additions: 1, deletions: 0, isBinary: false, hunks: [] },
    { path: 'b.test.ts', sha: 'b1', status: 'added', additions: 1, deletions: 0, isBinary: false, hunks: [] },
  ],
}

let fake: ReturnType<typeof installFakeAgents>
let dir: string

function call(functions: ReturnType<typeof agentRpcFunctions>, name: string, ...args: unknown[]) {
  const fn = functions.find(candidate => candidate.name === name)
  // The handlers take the validated argument shapes; the test passes them as the browser would.
  return (fn!.handler as (...input: unknown[]) => unknown)(...args)
}

beforeEach(() => {
  fake = installFakeAgents()
  dir = mkdtempSync(join(tmpdir(), 'pulls-review-agent-rpc-'))
})

afterEach(() => {
  fake.restore()
  rmSync(dir, { recursive: true, force: true })
})

describe('agent RPC', () => {
  it('lists agents and their models', async () => {
    const functions = agentRpcFunctions({ cwd: dir, patchDir: join(dir, 'patches'), channel: memoryChannel().channel })
    expect(await call(functions, LOCAL_RPC.agentList)).toEqual([
      expect.objectContaining({ name: 'claude' }),
      expect.objectContaining({ name: 'opencode' }),
    ])
    expect(await call(functions, LOCAL_RPC.agentModels, { agent: 'claude' })).toContainEqual({ id: 'sonnet', name: 'Sonnet (latest)' })
  })

  it('streams an analysis, ending with the result, and a GitHub diff runs outside the repository', async () => {
    fake.replay('claude-analysis.jsonl')
    const { channel, stream } = memoryChannel()
    const functions = agentRpcFunctions({ cwd: dir, patchDir: join(dir, 'patches'), channel })

    const { streamId } = await call(functions, LOCAL_RPC.agentAnalyze, { agent: 'claude', diff, locale: 'en' }) as { streamId: string }
    await stream(streamId).done

    const events = stream(streamId).events
    expect(events.at(-1)).toEqual({ kind: 'end', stopReason: 'done' })
    expect(events.find(event => event.kind === 'result')?.result.groups).toHaveLength(1)
    expect(fake.calls()[0]!.cwd).not.toBe(dir)
  })

  it('ends a failed run with its error, and an aborted one as aborted', async () => {
    fake.replay()
    fake.exitWith(1, 'boom')
    const { channel, stream } = memoryChannel()
    const functions = agentRpcFunctions({ cwd: dir, patchDir: join(dir, 'patches'), channel })

    const failed = await call(functions, LOCAL_RPC.agentAnalyze, { agent: 'claude', diff, locale: 'en' }) as { streamId: string }
    await stream(failed.streamId).done
    expect(stream(failed.streamId).events.at(-1)).toMatchObject({ kind: 'end', stopReason: 'error', error: expect.stringContaining('boom') })

    fake.replay('claude-analysis.jsonl')
    process.env.FAKE_AGENT_SLEEP = '5000'
    const aborted = await call(functions, LOCAL_RPC.agentAnalyze, { agent: 'claude', diff, locale: 'en' }) as { streamId: string }
    await new Promise(resolve => setTimeout(resolve, 200))
    await call(functions, LOCAL_RPC.agentAbort, { streamId: aborted.streamId })
    await stream(aborted.streamId).done
    delete process.env.FAKE_AGENT_SLEEP
    expect(stream(aborted.streamId).events.at(-1)).toEqual({ kind: 'end', stopReason: 'aborted' })
  })

  it('carries the lost-session code so the browser can offer re-analysis', async () => {
    fake.replay()
    fake.exitWith(1, 'Error: Session not found')
    const { channel, stream } = memoryChannel()
    const functions = agentRpcFunctions({ cwd: dir, patchDir: join(dir, 'patches'), channel })
    const session = { messages: [{ role: 'user', content: 'analyze', timestamp: 0 }], chatStartIndex: 1, agent: { agent: 'opencode', id: 'gone' } }

    const { streamId } = await call(functions, LOCAL_RPC.agentChat, { agent: 'opencode', diff, locale: 'en', session, text: 'why?' }) as { streamId: string }
    await stream(streamId).done

    expect(stream(streamId).events.at(-1)).toMatchObject({ kind: 'end', stopReason: 'error', code: 'agent-session-lost' })
  })
})
