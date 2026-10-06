import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./fake-agent.mjs', import.meta.url))
export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

export interface FakeCall { args: string[], stdin: string, cwd: string }

/**
 * Puts `claude` and `opencode` on `PATH` as scripts replaying fixture streams (`fake-agent.mjs`),
 * so the adapters run their real spawn-and-parse path against a known stream.
 */
export function installFakeAgents() {
  const dir = mkdtempSync(join(tmpdir(), 'pulls-review-fake-agent-'))
  for (const name of ['claude', 'opencode']) {
    writeFileSync(join(dir, name), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
    chmodSync(join(dir, name), 0o755)
  }
  const previous = { PATH: process.env.PATH, FAKE_AGENT_DIR: process.env.FAKE_AGENT_DIR }
  process.env.PATH = `${dir}:${process.env.PATH}`
  process.env.FAKE_AGENT_DIR = dir
  return {
    /** The streams to replay, one per call; the last repeats. */
    replay(...fixtures: string[]) {
      writeFileSync(join(dir, 'fixtures'), fixtures.map(fixture).join('\n'))
    },
    exitWith(code: number, stderr = '') {
      writeFileSync(join(dir, 'exit'), String(code))
      writeFileSync(join(dir, 'stderr'), stderr)
    },
    calls(): FakeCall[] {
      return JSON.parse(readFileSync(join(dir, 'calls.json'), 'utf8'))
    },
    restore() {
      process.env.PATH = previous.PATH
      process.env.FAKE_AGENT_DIR = previous.FAKE_AGENT_DIR
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
