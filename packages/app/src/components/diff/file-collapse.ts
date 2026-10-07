import type { InjectionKey } from 'vue'

/**
 * Collapse state the viewer set for a file (by hand or in bulk from the header), keyed
 * by `sha`; a file without an entry falls back to `FileDiff`'s default. Owned by
 * `DiffsPage` so the header can drive every file, mounted or not.
 */
export const fileCollapseKey: InjectionKey<Map<string, boolean>> = Symbol('file-collapse')
