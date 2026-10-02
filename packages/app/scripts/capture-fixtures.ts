// One-off script: captures real GitHub PRs through the GitHub PR source + ruleBasedAdapter
// into test/fixtures/real/*.json, for Storybook and manual testing against real data.
// Run with: GITHUB_TOKEN=... pnpm exec jiti scripts/capture-fixtures.ts
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { staticCredentials } from '@pulls.review/core/types'
import { ruleBasedAdapter } from '../src/analyze'

const targets = [
  'https://github.com/devframes/devframe/pull/387',
  'https://github.com/vuejs/core/pull/12349',
  'https://github.com/antfu/eslint-config/pull/861',
]

function parseTarget(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match)
    throw new Error(`Invalid GitHub PR URL: ${url}`)
  const [, owner, repo, number] = match
  return { owner, repo, number, name: `${owner}-${repo}-${number}` }
}

async function main() {
  for (const url of targets) {
    const target = parseTarget(url)
    console.log(`Fetching ${target.owner}/${target.repo}#${target.number}...`)
    const diff = await createGithubPullRequestSource(target, staticCredentials(process.env.GITHUB_TOKEN)).fetch()
    const grouped = await ruleBasedAdapter.analyze(diff)
    const path = `test/fixtures/real/${target.name}.json`
    writeFileSync(path, `${JSON.stringify({ diff, grouped }, null, 2)}\n`)
    console.log(`Wrote ${path} (${diff.files.length} files)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
