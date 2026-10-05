import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { LOCAL_BASE_PATH, LOCAL_DEVFRAME_ID } from '@pulls.review/core/local-rpc'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { localRpcFunctions } from './rpc'
import { createRepoCacheDriver } from './storage'

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
  basePath: LOCAL_BASE_PATH,
  clientAssets: fileURLToPath(new URL('./client', import.meta.url)),
  importMetaUrl: import.meta.url,
  cli: { command: 'pulls.review', port: 7390 },
  async setup(ctx, { flags } = {}) {
    const scope = ctx.scope(LOCAL_DEVFRAME_ID)
    const functions = localRpcFunctions({
      cwd: ctx.cwd,
      defaultTarget: typeof flags?.target === 'string' ? flags.target : '',
      driver: await createRepoCacheDriver(ctx.cwd),
      env: process.env,
    })
    for (const fn of functions)
      scope.rpc.register(fn)
  },
})
