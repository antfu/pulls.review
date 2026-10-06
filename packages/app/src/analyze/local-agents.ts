import type { LocalAgentName } from '@pulls.review/core/analyze'
import type { ModelOption } from '@pulls.review/core/llm'
import type { LocalAgentInfo } from '@pulls.review/core/local-rpc'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

/**
 * The agent CLIs the `pulls.review` server found, for the Settings' "Local agent" provider
 * (`plans/11-local-agents.md`). Provided by the `PR_LOCAL` build only; elsewhere the
 * provider renders disabled.
 */
export interface LocalAgents {
  /** `undefined` until the server has answered. */
  agents: Ref<LocalAgentInfo[] | undefined>
  models: (agent: LocalAgentName) => Promise<ModelOption[]>
}

export const localAgentsKey: InjectionKey<LocalAgents> = Symbol('local-agents')

export function useLocalAgents(): LocalAgents | undefined {
  return inject(localAgentsKey, undefined)
}
