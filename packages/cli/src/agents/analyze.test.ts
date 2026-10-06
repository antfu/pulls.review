import type { AgentStreamEvent } from '@pulls.review/core/local-rpc'
import type { DiffsPayload } from '@pulls.review/core/types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT_SESSION_LOST } from '@pulls.review/core/local-rpc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFakeAgents } from '../../test/fake-agents'
import { runAgentAnalysis } from './analyze'
import { runAgentChat } from './chat'
import { claude } from './claude'
import { detectAgents } from './index'
import { opencode } from './opencode'

const diff: DiffsPayload = {
  ref: { kind: 'local', repo: '/repo', target: 'main...feat' },
  title: 'Add the thing',
  files: [
    { path: 'a.ts', sha: 'a1', status: 'added', additions: 1, deletions: 0, isBinary: false, hunks: [{ header: '@@ -0,0 +1 @@', oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, patch: '+thing' }] },
    { path: 'b.test.ts', sha: 'b1', status: 'added', additions: 1, deletions: 0, isBinary: false, hunks: [{ header: '@@ -0,0 +1 @@', oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, patch: '+test' }] },
  ],
}

let fake: ReturnType<typeof installFakeAgents>
let dir: string
let events: AgentStreamEvent[]

const options = () => ({ diff, locale: 'en' as const, cwd: dir, patchDir: join(dir, 'patches'), emit: (event: AgentStreamEvent) => events.push(event), signal: new AbortController().signal })
const kinds = () => events.map(event => event.kind)
const result = () => events.find(event => event.kind === 'result')?.result

beforeEach(() => {
  fake = installFakeAgents()
  dir = mkdtempSync(join(tmpdir(), 'pulls-review-agent-run-'))
  events = []
})

afterEach(() => {
  fake.restore()
  rmSync(dir, { recursive: true, force: true })
})

describe('detectAgents', () => {
  it('lists the CLIs on PATH with their versions', async () => {
    fake.replay('claude-analysis.jsonl')
    expect(await detectAgents()).toEqual([
      { name: 'claude', label: 'Claude Code', version: '0.0.0-fake', models: expect.arrayContaining([{ id: 'sonnet', name: 'Sonnet (latest)' }]) },
      { name: 'opencode', label: 'OpenCode', version: '0.0.0-fake', models: [] },
    ])
  })
})

describe('runAgentAnalysis', () => {
  it('runs claude headless with the schema and read-only tools, and streams its session, transcript and progress', async () => {
    fake.replay('claude-analysis.jsonl')

    await runAgentAnalysis({ ...options(), cli: claude, model: 'sonnet' })

    const [call] = fake.calls()
    expect(call!.args).toEqual(expect.arrayContaining(['-p', '--output-format', 'stream-json', '--json-schema', '--allowedTools', 'Read', '--model', 'sonnet']))
    expect(call!.args).not.toContain('--resume')
    expect(call!.args[call!.args.indexOf('--system-prompt') + 1]).toContain(join(dir, 'patches'))
    expect(call!.stdin).toContain('---MANIFEST---')
    expect(call!.cwd).toBe(dir)

    expect(kinds()).toEqual(['messages', 'progress', 'messages', 'progress', 'messages', 'messages', 'progress', 'progress', 'result', 'end'])
    expect(events.filter(event => event.kind === 'progress').map(event => event.progress)).toEqual([
      { step: 1, kind: 'thinking' },
      { step: 1, kind: 'reading', paths: ['b.test.ts'] },
      { step: 1, kind: 'thinking' },
      { step: 2, kind: 'organizing' },
    ])
    const transcript = events.findLast(event => event.kind === 'messages')!.messages
    expect(transcript.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'toolResult', 'assistant'])
    expect(result()).toMatchObject({ source: 'llm', model: 'claude/claude-sonnet-4-5', locale: 'en', groups: [{ key: 'thing', filePaths: ['a.ts', 'b.test.ts'] }] })
    expect(events.at(-1)).toEqual({ kind: 'end', stopReason: 'done', agent: { agent: 'claude', id: 'sess-claude-1', model: 'claude-sonnet-4-5' } })
  })

  it('asks once more, in the same session, when the grouping misses a path', async () => {
    fake.replay('claude-analysis-missing.jsonl', 'claude-analysis.jsonl')

    await runAgentAnalysis({ ...options(), cli: claude })

    const calls = fake.calls()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.args).toContain('--resume')
    expect(calls[1]!.args[calls[1]!.args.indexOf('--resume') + 1]).toBe('sess-claude-1')
    expect(calls[1]!.stdin).toMatch(/^Missing paths: b\.test\.ts/)
    expect(result()?.groups[0]?.filePaths).toEqual(['a.ts', 'b.test.ts'])
  })

  it('gives up after the second miss with the issues as the error', async () => {
    fake.replay('claude-analysis-missing.jsonl')

    await expect(runAgentAnalysis({ ...options(), cli: claude })).rejects.toThrow(/Missing paths: b\.test\.ts/)
    expect(fake.calls()).toHaveLength(2)
  })

  it('fails with what the CLI reported when the run errors', async () => {
    fake.replay('claude-api-error.jsonl')
    fake.exitWith(1)

    await expect(runAgentAnalysis({ ...options(), cli: claude })).rejects.toThrow('API Error: 400 Not a valid API key for this workspace')
  })

  it('runs opencode with the schema in the prompt and reads the grouping from its last fenced JSON', async () => {
    fake.replay('opencode-analysis.jsonl')

    await runAgentAnalysis({ ...options(), cli: opencode, model: 'vercel/anthropic/claude-sonnet-4.5' })

    const [call] = fake.calls()
    expect(call!.args).toEqual(['run', '--format', 'json', '--agent', 'plan', '--model', 'vercel/anthropic/claude-sonnet-4.5'])
    expect(call!.stdin).toContain('<schema>')
    expect(call!.stdin).toContain('---MANIFEST---')
    expect(events.filter(event => event.kind === 'progress').map(event => event.progress)).toContainEqual({ step: 1, kind: 'reading', paths: ['/repo/b.test.ts'] })
    expect(result()).toMatchObject({ model: 'opencode/vercel/anthropic/claude-sonnet-4.5', groups: [{ key: 'thing' }] })
  })

  it('runs a GitHub diff in a scratch directory, not the repository', async () => {
    fake.replay('opencode-analysis.jsonl')

    await runAgentAnalysis({ ...options(), cli: opencode, diff: { ...diff, ref: { kind: 'github-pr', owner: 'o', repo: 'r', number: '1' } } })

    expect(fake.calls()[0]!.stdin).toContain('The patch is all there is')
  })

  it('stops the CLI when aborted', async () => {
    fake.replay('claude-analysis.jsonl')
    process.env.FAKE_AGENT_SLEEP = '5000'
    const controller = new AbortController()
    const run = runAgentAnalysis({ ...options(), cli: claude, signal: controller.signal })
    await new Promise(resolve => setTimeout(resolve, 200))
    controller.abort()

    await expect(run).rejects.toThrow('Aborted')
    delete process.env.FAKE_AGENT_SLEEP
  })
})

describe('runAgentChat', () => {
  const session = { messages: [{ role: 'user' as const, content: 'analyze', timestamp: 0 }], chatStartIndex: 1, agent: { agent: 'opencode', id: 'ses_oc1' } }

  it('resumes the agent session with the question and keeps a plain answer as the reply', async () => {
    fake.replay('opencode-chat-answer.jsonl')

    await runAgentChat({ ...options(), cli: opencode, session, text: 'why?' })

    const [call] = fake.calls()
    expect(call!.args).toEqual(['run', '--format', 'json', '--agent', 'plan', '--session', 'ses_oc1'])
    expect(call!.stdin).toContain('<chat>')
    expect(call!.stdin).toMatch(/why\?$/)
    expect(kinds()).not.toContain('result')
    const transcript = events.findLast(event => event.kind === 'messages')!.messages
    expect(transcript.map(message => message.role)).toEqual(['user', 'user', 'assistant'])
    expect(events.at(-1)).toEqual({ kind: 'end', stopReason: 'done', agent: { agent: 'opencode', id: 'ses_oc1' } })
  })

  it('applies a fenced grouping in the reply like update_grouping', async () => {
    fake.replay('opencode-chat-regroup.jsonl')

    await runAgentChat({ ...options(), cli: opencode, session, text: 'split the tests out' })

    expect(result()?.groups.map(group => group.key)).toEqual(['thing', 'tests'])
    const transcript = events.findLast(event => event.kind === 'messages')!.messages
    expect(transcript.at(-2)).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'Split as asked.' }] })
    expect(transcript.at(-1)).toMatchObject({ role: 'toolResult', toolName: 'update_grouping', isError: false, content: [{ type: 'text', text: 'Grouping updated: 2 groups.' }] })
  })

  it('re-sends the last user message on a retry', async () => {
    fake.replay('opencode-chat-answer.jsonl')

    await runAgentChat({ ...options(), cli: opencode, session: { ...session, messages: [...session.messages, { role: 'user', content: 'why?', timestamp: 1 }] } })

    expect(fake.calls()[0]!.stdin).toMatch(/why\?$/)
  })

  it('reports a session the CLI no longer has', async () => {
    fake.replay()
    fake.exitWith(1, 'Error: Session not found\n')

    await expect(runAgentChat({ ...options(), cli: opencode, session, text: 'why?' })).rejects.toMatchObject({ code: AGENT_SESSION_LOST })
  })

  it('refuses a session started with another provider', async () => {
    await expect(runAgentChat({ ...options(), cli: claude, session, text: 'why?' })).rejects.toThrow(/not started with Claude Code/)
  })
})
