import type { DiffCategory, DiffGroup, DiffGroupLeaf } from '../../types/analyze'
import type { FileChange } from '../../types/diff'

export interface ResolvedGroup {
  key: string
  label: string
  summary?: string
  category: DiffCategory
  files: FileChange[]
  /** Paths the analysis named that are no longer in the diff, rendered as removed. */
  missing: string[]
  added: number
  deleted: number
}

export interface ResolvedGroupWithChildren extends ResolvedGroup {
  children: ResolvedGroup[]
}

function toResolvedGroup(leaf: Pick<DiffGroupLeaf, 'key' | 'label' | 'summary' | 'category'>, files: FileChange[], missing: string[]): ResolvedGroup {
  return {
    key: leaf.key,
    label: leaf.label,
    summary: leaf.summary,
    category: leaf.category ?? 'other', // results stored before the field existed
    files,
    missing,
    added: files.reduce((sum, file) => sum + file.additions, 0),
    deleted: files.reduce((sum, file) => sum + file.deletions, 0),
  }
}

/**
 * Reconciles an analysis against the diff it's viewed with, which may be newer than
 * the one it was computed from (new commits, or a shared/partial result): paths still
 * in the diff resolve to `FileChange`s (a renamed file is found by its old path too),
 * paths that vanished become `missing`, and files no group names are collected into a
 * trailing "Uncategorized" group so nothing is silently dropped from the view.
 */
export function resolveGroups(groups: DiffGroup[], files: FileChange[]): ResolvedGroupWithChildren[] {
  const byPath = new Map(files.map(file => [file.path, file]))
  const byPreviousPath = new Map(files.flatMap(file => file.previousPath ? [[file.previousPath, file] as const] : []))
  const referenced = new Set<FileChange>()

  function resolveLeaf(leaf: DiffGroupLeaf): ResolvedGroup {
    const resolved: FileChange[] = []
    const missing: string[] = []
    for (const path of leaf.filePaths) {
      const file = byPath.get(path) ?? byPreviousPath.get(path)
      if (file) {
        resolved.push(file)
        referenced.add(file)
      }
      else {
        missing.push(path)
      }
    }
    return toResolvedGroup(leaf, resolved, missing)
  }

  const resolvedGroups = groups.map(group => ({
    ...resolveLeaf(group),
    children: (group.children ?? []).map(resolveLeaf),
  }))

  const uncategorized = files.filter(file => !referenced.has(file))
  if (uncategorized.length > 0) {
    resolvedGroups.push({
      ...toResolvedGroup({ key: 'uncategorized', label: 'Uncategorized', summary: 'Files not covered by the current analysis.', category: 'other' }, uncategorized, []),
      children: [],
    })
  }
  return resolvedGroups
}

export function countGroupFiles(group: ResolvedGroupWithChildren): number {
  return group.files.length + group.children.reduce((n, child) => n + child.files.length, 0)
}

/** Totals a group's own +/- counts with its children's, for display alongside `countGroupFiles`. */
export function countGroupStats(group: ResolvedGroupWithChildren): { added: number, deleted: number } {
  return {
    added: group.added + group.children.reduce((n, child) => n + child.added, 0),
    deleted: group.deleted + group.children.reduce((n, child) => n + child.deleted, 0),
  }
}
