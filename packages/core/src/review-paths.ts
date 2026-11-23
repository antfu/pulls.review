import type { FileChange } from './types/diff'

/** A path repeated in either diff cannot identify one file across a refetch. */
export function repeatedFilePaths(previous: FileChange[], current: FileChange[]): Set<string> {
  const repeated = new Set<string>()
  for (const files of [previous, current]) {
    const seen = new Set<string>()
    for (const { path } of files) {
      if (seen.has(path))
        repeated.add(path)
      seen.add(path)
    }
  }
  return repeated
}
