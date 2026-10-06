import type { LocalAgentInfo } from '@pulls.review/core/local-rpc'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

/**
 * The agent CLIs the `pulls.review` server found, with their model catalogs, for the
 * Settings' "Local agent" provider (`plans/11-local-agents.md`); `undefined` until the
 * server has answered. Provided by the `PR_LOCAL` build only; elsewhere the provider
 * renders disabled.
 */
export type LocalAgents = Ref<LocalAgentInfo[] | undefined>

export const localAgentsKey: InjectionKey<LocalAgents> = Symbol('local-agents')

export function useLocalAgents(): LocalAgents | undefined {
  return inject(localAgentsKey, undefined)
}
