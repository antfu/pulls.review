import type { Virtualizer } from '@pierre/diffs'
import type { InjectionKey } from 'vue'

export const diffVirtualizerKey: InjectionKey<Virtualizer> = Symbol('diffs-virtualizer')
