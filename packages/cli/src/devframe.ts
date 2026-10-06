import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { LOCAL_AGENT_CHANNEL, LOCAL_DEVFRAME_ID } from '@pulls.review/core/local-rpc'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { agentRpcFunctions } from './agents/rpc'
import { localRpcFunctions } from './rpc'
import { createRepoCacheDriver, repoCacheDir } from './storage'

/**
 * The one definition every surface consumes: the `pulls.review` CLI (`index.ts`)
 * and, through `createPluginFromDevframe`, a devframe hub. The SPA is the app's
 * `PR_LOCAL` build, copied next to this file by the package build.
 */
export default defineDevframe({
  id: LOCAL_DEVFRAME_ID,
  name: 'pulls.review',
  version: pkg.version,
  packageName: pkg.name,
  description: 'Review local git changes, grouped and summarized.',
  homepage: 'https://pulls.review',
  icon: 'ph:git-diff-duotone',
  clientAssets: fileURLToPath(new URL('./client', import.meta.url)),
  importMetaUrl: import.meta.url,
  cli: { command: 'pulls.review', port: 7390 },
  // No base path: devframe serves it at `/` standalone and at `/__pulls.review/` in a hub.
  // The server holds no target - every page names its own, so the CLI's argument only picks
  // which page opens.
  async setup(ctx) {
    const scope = ctx.scope(LOCAL_DEVFRAME_ID)
    const functions = [
      ...localRpcFunctions({
        cwd: ctx.cwd,
        driver: await createRepoCacheDriver(ctx.cwd),
        env: process.env,
      }),
      ...agentRpcFunctions({
        cwd: ctx.cwd,
        patchDir: join(await repoCacheDir(ctx.cwd), 'agent'),
        channel: scope.rpc.streaming.create(LOCAL_AGENT_CHANNEL),
      }),
    ]
    for (const fn of functions)
      scope.rpc.register(fn)
  },
})
