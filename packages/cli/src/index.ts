import process from 'node:process'
import { parseArgs } from 'node:util'
import { parseTarget } from '@pulls.review/core/local'
import { createDevServer } from 'devframe/adapters/dev'
import devframe from './devframe'

const HELP = `Usage: pulls.review [target] [options]

Reviews local git changes in the browser, grouped and summarized. Run it inside
a git repository.

Target (git revision syntax):
  (none)     the working tree against HEAD, untracked files included
  <rev>      one commit against its parent
  A..B       the tree diff between two revisions
  A...B      what B adds since it forked from A

Options:
  --port <port>  port to listen on
  --no-open      do not open the browser
  -h, --help

To review a GitHub pull request in CI, use @pulls.review/actions.
`

async function main() {
  const { values: flags, positionals } = parseArgs({
    options: {
      'port': { type: 'string' },
      'no-open': { type: 'boolean' },
      'help': { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })
  if (flags.help) {
    process.stdout.write(HELP)
    return
  }
  const target = positionals[0] ?? ''
  // Fail on a bad target here, before a browser opens onto an error.
  parseTarget(target)
  await createDevServer(devframe, {
    port: flags.port ? Number(flags.port) : undefined,
    openBrowser: !flags['no-open'],
    flags: { target },
    onReady: ({ origin }) => {
      process.stdout.write(`pulls.review is reviewing ${target || 'the working tree'} at ${origin}${devframe.basePath}\n`)
    },
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
