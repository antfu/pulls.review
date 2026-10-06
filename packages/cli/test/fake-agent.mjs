// Stands in for an agent CLI on PATH: records how it was called, replays a fixture stream, exits as told.
// FAKE_AGENT_DIR holds `calls.json` (appended per call), `fixtures` (one path per line, one per call,
// the last repeating), and optional `exit` (code) and `stderr` text.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

if (process.argv.includes('--version')) {
  console.log('0.0.0-fake')
  process.exit(0)
}

const dir = process.env.FAKE_AGENT_DIR
const stdin = readFileSync(0, 'utf8')
const callsFile = join(dir, 'calls.json')
const calls = existsSync(callsFile) ? JSON.parse(readFileSync(callsFile, 'utf8')) : []
calls.push({ args: process.argv.slice(2), stdin, cwd: process.cwd() })
writeFileSync(callsFile, JSON.stringify(calls))

const fixtures = existsSync(join(dir, 'fixtures')) ? readFileSync(join(dir, 'fixtures'), 'utf8').trim().split('\n') : []
const fixture = fixtures[Math.min(calls.length - 1, fixtures.length - 1)]
if (process.env.FAKE_AGENT_SLEEP)
  await new Promise(resolve => setTimeout(resolve, Number(process.env.FAKE_AGENT_SLEEP)))
if (fixture)
  process.stdout.write(readFileSync(fixture, 'utf8'))
if (existsSync(join(dir, 'stderr')))
  process.stderr.write(readFileSync(join(dir, 'stderr'), 'utf8'))
process.exitCode = existsSync(join(dir, 'exit')) ? Number(readFileSync(join(dir, 'exit'), 'utf8')) : 0
appendFileSync(callsFile, '')
