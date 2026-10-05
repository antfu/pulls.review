#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { llmSettingsFromEnv } from '@pulls.review/core/env'
import { runLlmAnalysis } from '@pulls.review/core/llm'
import { Diagnostic, formatDiagnostic } from 'nostics'
import { resolveGithubToken, resolveLocale, resolveTarget } from './config'
import { run } from './run'

const HELP = `Usage: pulls-review-actions [owner/repo#123 | https://github.com/owner/repo/pull/123] [options]

Analyzes the pull request with an LLM and posts (or updates) the grouped summary as
a PR comment that pulls.review picks up. Without a target, reads the pull_request
event of the running GitHub Actions job.

Options:
  --provider <name>  gateway | anthropic | openai-compatible  (PULLS_REVIEW_PROVIDER)
  --model <id>       model id for the provider                 (PULLS_REVIEW_MODEL)
  --locale <tag>     language of the summaries, default en     (PULLS_REVIEW_LOCALE)
  -h, --help

Environment:
  GITHUB_TOKEN           token with pull-requests: write       (PULLS_REVIEW_GITHUB_TOKEN)
  AI_GATEWAY_API_KEY     Vercel AI Gateway key                  (PULLS_REVIEW_API_KEY)
  ANTHROPIC_API_KEY      Anthropic key                          (PULLS_REVIEW_API_KEY)
  OPENAI_API_KEY         OpenAI-compatible key                  (PULLS_REVIEW_API_KEY)
  OPENAI_BASE_URL        OpenAI-compatible endpoint             (PULLS_REVIEW_BASE_URL)
`

function readEvent(path: string | undefined) {
  return path ? JSON.parse(readFileSync(path, 'utf-8')) : undefined
}

async function main() {
  const { values: flags, positionals } = parseArgs({
    options: {
      provider: { type: 'string' },
      model: { type: 'string' },
      locale: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })
  if (flags.help) {
    console.log(HELP)
    return
  }
  const env = process.env
  const outcome = await run({
    pr: resolveTarget(positionals[0], env, readEvent(env.GITHUB_EVENT_PATH)),
    githubToken: resolveGithubToken(env),
    llm: llmSettingsFromEnv(env, flags),
    locale: resolveLocale(env, flags),
    log: line => console.log(line),
  }, runLlmAnalysis)
  console.log(outcome.status === 'up-to-date'
    ? `Comment already covers the current head: ${outcome.url}`
    : `Posted ${outcome.url}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Diagnostic ? formatDiagnostic(error) : error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
