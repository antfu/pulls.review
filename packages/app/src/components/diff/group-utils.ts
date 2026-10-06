import type { DiffCategory, DiffGroup, DiffGroupLeaf, DiffSide, FileChange, GroupNote } from '@pulls.review/core/types'
import { t } from '../../i18n'

/** A group note resolved against its file: `anchor` is set only when a hunk actually shows that line. */
export interface FileNote {
  text: string
  critical: boolean
  anchor?: { side: DiffSide, line: number }
}

export interface ResolvedGroup {
  key: string
  label: string
  summary?: string
  category: DiffCategory
  /** Flagged by the analysis itself, or carrying a critical note on one of its files. */
  critical: boolean
  files: FileChange[]
  /** Notes by file sha; files without notes have no entry. */
  notes: Map<string, FileNote[]>
  /** Paths the analysis named that are no longer in the diff, rendered as removed. */
  missing: string[]
  added: number
  deleted: number
}

export interface ResolvedGroupWithChildren extends ResolvedGroup {
  children: ResolvedGroup[]
}

function hunkShowsLine(file: FileChange, side: DiffSide, line: number): boolean {
  return file.hunks.some((hunk) => {
    const [start, count] = side === 'additions' ? [hunk.newStart, hunk.newLines] : [hunk.oldStart, hunk.oldLines]
    return line >= start && line < start + count
  })
}

function resolveNote(note: GroupNote, file: FileChange): FileNote {
  const resolved: FileNote = { text: note.text, critical: note.critical ?? false }
  if (note.line === undefined)
    return resolved
  const side = note.side ?? (file.status === 'removed' ? 'deletions' : 'additions')
  if (hunkShowsLine(file, side, note.line))
    resolved.anchor = { side, line: note.line }
  return resolved
}

export function fileIsCritical(notes: FileNote[] | undefined): boolean {
  return notes?.some(note => note.critical) ?? false
}

function toResolvedGroup(leaf: Pick<DiffGroupLeaf, 'key' | 'label' | 'summary' | 'category' | 'critical'>, files: FileChange[], notes: Map<string, FileNote[]>, missing: string[]): ResolvedGroup {
  return {
    key: leaf.key,
    label: leaf.label,
    summary: leaf.summary,
    category: leaf.category ?? 'other', // results stored before the field existed
    critical: (leaf.critical ?? false) || [...notes.values()].some(fileIsCritical),
    files,
    notes,
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
    const notes = new Map<string, FileNote[]>()
    for (const note of leaf.notes ?? []) {
      const file = byPath.get(note.path) ?? byPreviousPath.get(note.path)
      if (file)
        notes.set(file.sha, [...notes.get(file.sha) ?? [], resolveNote(note, file)])
    }
    return toResolvedGroup(leaf, resolved, notes, missing)
  }

  const resolvedGroups = groups.map(group => ({
    ...resolveLeaf(group),
    children: (group.children ?? []).map(resolveLeaf),
  }))

  const uncategorized = files.filter(file => !referenced.has(file))
  if (uncategorized.length > 0) {
    resolvedGroups.push({
      ...toResolvedGroup({ key: 'uncategorized', label: t('group.uncategorized'), summary: t('group.uncategorizedSummary'), category: 'other' }, uncategorized, new Map(), []),
      children: [],
    })
  }
  return resolvedGroups
}

export function countGroupFiles(group: ResolvedGroupWithChildren): number {
  return group.files.length + group.children.reduce((n, child) => n + child.files.length, 0)
}

/** A chapter is critical when it or any of its children is. */
export function groupIsCritical(group: ResolvedGroupWithChildren): boolean {
  return group.critical || group.children.some(child => child.critical)
}

/** Share of a group's files (its own and its children's) marked reviewed; an empty group counts as done. */
export function groupProgress(group: ResolvedGroupWithChildren, reviewed: Set<string>): number {
  const files = [...group.files, ...group.children.flatMap(child => child.files)]
  if (files.length === 0)
    return 1
  return files.filter(file => reviewed.has(file.sha)).length / files.length
}

/** Totals a group's own +/- counts with its children's, for display alongside `countGroupFiles`. */
export function countGroupStats(group: ResolvedGroupWithChildren): { added: number, deleted: number } {
  return {
    added: group.added + group.children.reduce((n, child) => n + child.added, 0),
    deleted: group.deleted + group.children.reduce((n, child) => n + child.deleted, 0),
  }
}
