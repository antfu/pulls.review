import type { InjectionKey } from 'vue'
import type { LocalRpc } from './connection'

/** Provided by `installLocal` for the `/local` page only; view components never read it. */
export const localRpcKey: InjectionKey<LocalRpc> = Symbol('local-rpc')
