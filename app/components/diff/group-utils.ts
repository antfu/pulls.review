import type { DiffGroup, DiffGroupLeaf } from '../../types/analyze'
import type { FileChange } from '../../types/diff'

export interface ResolvedGroup {
  key: string
  label: string
  summary?: string
  files: FileChange[]
  added: number
  deleted: number
}

export interface ResolvedGroupWithChildren extends ResolvedGroup {
  children: ResolvedGroup[]
}

function resolveLeaf(leaf: DiffGroupLeaf, byPath: Map<string, FileChange>): ResolvedGroup {
  const files = leaf.filePaths.map(path => byPath.get(path)).filter((file): file is FileChange => file != null)
  return {
    key: leaf.key,
    label: leaf.label,
    summary: leaf.summary,
    files,
    added: files.reduce((sum, file) => sum + file.additions, 0),
    deleted: files.reduce((sum, file) => sum + file.deletions, 0),
  }
}

/** Resolves each group's `filePaths` into real `FileChange`s and totals their +/- counts, for both the sidebar tree and the diff panels to share. */
export function resolveGroups(groups: DiffGroup[], files: FileChange[]): ResolvedGroupWithChildren[] {
  const byPath = new Map(files.map(file => [file.path, file]))
  return groups.map(group => ({
    ...resolveLeaf(group, byPath),
    children: (group.children ?? []).map(child => resolveLeaf(child, byPath)),
  }))
}

export function countGroupFiles(group: ResolvedGroupWithChildren): number {
  return group.files.length + group.children.reduce((n, child) => n + child.files.length, 0)
}
