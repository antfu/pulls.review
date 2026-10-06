import type { LocalAgentName } from '@pulls.review/core/analyze'
import type { LocalAgentInfo } from '@pulls.review/core/local-rpc'
import type { AgentCli } from './types'
import { claude } from './claude'
import { opencode } from './opencode'

export const agents: Record<LocalAgentName, AgentCli> = { claude, opencode }

/** The agent CLIs on `PATH`, with their versions. */
export async function detectAgents(): Promise<LocalAgentInfo[]> {
  const found = await Promise.all(Object.values(agents).map(async cli => ({ name: cli.name, label: cli.label, version: await cli.detect() })))
  return found.flatMap(agent => agent.version ? [{ ...agent, version: agent.version }] : [])
}
