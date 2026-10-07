import type { FileChange } from '@pulls.review/core/types'
import type { FileListLayout } from '../../state/file-list'

export interface FileRow {
  key: string
  depth: number
  type: 'folder' | 'file' | 'missing'
  name: string
  file?: FileChange
  /** Folder rows only: every file nested under it, for the folder-level checkbox. */
  files?: FileChange[]
}

/**
 * Flattens a group's files into sidebar rows, keeping the order the diffs render in.
 * A tree can't always match it exactly - a folder shows up where its first file
 * does, gathering the rest of its files in - while the list matches it one to one.
 * Missing paths have no place in that order, so they trail at the end.
 */
export function fileRows(files: FileChange[], missing: string[], layout: FileListLayout): FileRow[] {
  const leaves = [
    ...files.map(file => ({ path: file.path, file })),
    ...missing.map(path => ({ path, file: undefined })),
  ]

  if (layout === 'list') {
    return leaves.map(({ path, file }) => file
      ? { key: `file:${path}`, depth: 0, type: 'file', name: path, file }
      : { key: `missing:${path}`, depth: 0, type: 'missing', name: path })
  }

  interface Node { name: string, children: Map<string, Node>, file?: FileChange, missing?: boolean }
  const root: Node = { name: '', children: new Map() }

  for (const { path, file } of leaves) {
    const segments = path.split('/')
    let node = root
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!
      let child = node.children.get(segment)
      if (!child) {
        child = { name: segment, children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
    node.children.set(`\0file:${path}`, { name: segments[segments.length - 1]!, children: new Map(), file, missing: !file })
  }

  function collectFiles(node: Node): FileChange[] {
    const result: FileChange[] = []
    for (const child of node.children.values())
      result.push(...(child.file ? [child.file] : collectFiles(child)))
    return result
  }

  const result: FileRow[] = []
  function walk(node: Node, depth: number, pathPrefix: string) {
    for (const [key, child] of node.children) {
      if (child.file) {
        result.push({ key: `file:${child.file.path}`, depth, type: 'file', name: child.name, file: child.file })
        continue
      }
      if (child.missing) {
        result.push({ key: `missing:${pathPrefix}${child.name}`, depth, type: 'missing', name: child.name })
        continue
      }

      // Collapse a chain of single-child folders into one row, e.g.
      // `src` -> `components` -> (diff, bar) renders as a single `src/components` row.
      let name = child.name
      let tail = child
      let prefix = `${pathPrefix}${key}/`
      while (tail.children.size === 1) {
        const [onlyKey, onlyChild] = [...tail.children.entries()][0]!
        if (onlyChild.file || onlyChild.missing)
          break
        name += `/${onlyChild.name}`
        tail = onlyChild
        prefix += `${onlyKey}/`
      }
      result.push({ key: `folder:${prefix}`, depth, type: 'folder', name, files: collectFiles(tail) })
      walk(tail, depth + 1, prefix)
    }
  }
  walk(root, 0, '')
  return result
}
