import { useLocalStorage } from '@vueuse/core'

/**
 * A single ambient preference shared across every diff view (GitHub PR pages, the
 * upload page, the embed) - a plain module-level singleton, like `dark.ts`'s
 * `isDark`, persisted the same way.
 */
export const layout = useLocalStorage<'split' | 'unified'>('diffs:layout', 'split')
