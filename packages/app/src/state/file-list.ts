import { useLocalStorage } from '@vueuse/core'

export type FileListLayout = 'tree' | 'list'

/** How each group's sidebar lists its files: nested by folder, or flat in diff order. */
export const fileListLayout = useLocalStorage<FileListLayout>('diffs:file-list', 'tree')
