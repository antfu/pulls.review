import type { App } from 'vue'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { createStorage } from 'unstorage'
import { createApp } from 'vue'
import { browserLlmRunner } from '../analyze/browser-llm-runner'
import { localAgentsKey } from '../analyze/local-agents'
import { installAppContext, settingsCredentials } from '../app-context'
import { i18n } from '../i18n'
import { createAgentLlmRunner, createLocalAgents } from './agent-runner'
import { connectLocal } from './connection'
import { localRpcKey } from './local-rpc-key'
import LocalAuthGate from './LocalAuthGate.vue'
import { createRpcCredentials, createRpcDriver } from './rpc-backends'

/** Until the server trusts this tab, every RPC call fails: ask for the terminal's code first. */
async function ensureTrusted(client: Awaited<ReturnType<typeof connectLocal>>['client']): Promise<void> {
  // `--open` lands the tab with the code in the URL, which `connectDevframe` exchanges
  // itself; a stored token from an earlier visit also settles this quickly. It rejects on timeout.
  if (await client.ensureTrusted(2000).catch(() => false))
    return
  const host = document.createElement('div')
  document.body.append(host)
  await new Promise<void>((resolve) => {
    const gate = createApp(LocalAuthGate, { client, onTrusted: resolve }).use(i18n)
    gate.mount(host)
  })
  host.remove()
}

/**
 * Wires a `PR_LOCAL` build to the `pulls.review` server: the cache lives in the repo
 * (over RPC), the GitHub token comes from the server's environment, a local agent CLI
 * can run the analysis, `/` picks refs and `/compare`, `/branch`, `/worktree` and
 * `/commit` review them.
 */
export async function installLocal(app: App): Promise<void> {
  const { client, rpc } = await connectLocal()
  await ensureTrusted(client)

  installAppContext(app, {
    cache: createCacheRepositories(createStorage({ driver: createRpcDriver(rpc) })),
    credentials: createRpcCredentials(rpc, settingsCredentials),
    llm: createAgentLlmRunner(rpc, browserLlmRunner),
  })
  app.provide(localRpcKey, rpc)
  app.provide(localAgentsKey, createLocalAgents(rpc))
}
