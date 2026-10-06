import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createDevServer } from 'devframe/adapters/dev'
import { H3 } from 'h3'
import devframe from './devframe'
import { pageFor } from './page'

const HELP = `Usage: pulls.review [target] [options]

Reviews local git changes - or any GitHub pull request - in the browser, grouped
and summarized. Run it inside a git repository. The target only picks the page
that opens; any other can be picked from the browser.

Target (git revision syntax):
  (none)     the current branch against the default branch, or the ref picker
             when the default branch itself is checked out
  <branch>   what a branch adds since it forked from the default branch
  <rev>      one commit against its parent
  A...B      what B adds since it forked from A
  A..B       the tree diff between two revisions

Target (GitHub):
  owner/repo#123, or a github.com pull request, compare, commit or repo URL.
  Uses the GitHub token from GITHUB_TOKEN, else from \`gh auth token\`.

AI analysis uses a key from Settings, or a coding agent installed here (Claude
Code, OpenCode) when "Local agent" is the provider in Settings.

Options:
  --worktree     open the uncommitted changes against HEAD
  --port <port>  port to listen on
  --no-open      do not open the browser
  -h, --help

To analyze a GitHub pull request from CI, use @pulls.review/actions.
`

/**
 * devframe's SPA fallback skips any path that looks like a file, and refs do: `main...feat`
 * ends in `.feat`, `v1.2` in `.2`. Pages whose path carries a ref (local ones, and GitHub
 * compares under `/gh/`) get the SPA's `index.html` here, before devframe's static handler sees them.
 */
function createAppWithRefRoutes(): H3 {
  const app = new H3()
  const index = fileURLToPath(new URL('./client/index.html', import.meta.url))
  app.use(async (event, next) => {
    if (!/^\/(?:compare|branch|commit|gh)\//.test(event.url.pathname) || !event.req.headers.get('accept')?.includes('text/html'))
      return next()
    return new Response(await readFile(index, 'utf8'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })
  return app
}

async function main() {
  const { values: flags, positionals } = parseArgs({
    options: {
      'worktree': { type: 'boolean' },
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
  const page = encodeURI(await pageFor(process.cwd(), positionals[0], !!flags.worktree))
  await createDevServer(devframe, {
    app: createAppWithRefRoutes(),
    port: flags.port ? Number(flags.port) : undefined,
    openBrowser: flags['no-open'] ? false : page,
    onReady: ({ origin }) => {
      process.stdout.write(`pulls.review is serving ${origin}${page}\n`)
    },
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
