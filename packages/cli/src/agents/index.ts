import type { LocalAgentName } from '@pulls.review/core/analyze'
import type { LocalAgentInfo } from '@pulls.review/core/local-rpc'
import type { AgentCli } from './types'
import { claude } from './claude'
import { codex } from './codex'
import { opencode } from './opencode'
import { pi } from './pi'

export const agents: Record<LocalAgentName, AgentCli> = { claude, opencode, pi, codex }

/** The agent CLIs on `PATH`, with their versions and model catalogs. */
export async function detectAgents(): Promise<LocalAgentInfo[]> {
  const found = await Promise.all(Object.values(agents).map(async (cli) => {
    const version = await cli.detect()
    return version ? [{ name: cli.name, label: cli.label, version, models: await cli.models() }] : []
  }))
  return found.flat()
}
