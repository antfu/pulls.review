import type { FileDiffMetadata } from '@pierre/diffs'
import type { FileChange } from '@pulls.review/core/types'
import { processFile } from '@pierre/diffs'

export interface FullFileContents {
  old?: string
  new?: string
}

function buildUnifiedDiffText(file: FileChange): string {
  const oldPath = file.previousPath ?? file.path
  const newPath = file.path
  const lines = [`diff --git a/${oldPath} b/${newPath}`]
  if (file.status === 'added')
    lines.push('new file mode 100644')
  else if (file.status === 'removed')
    lines.push('deleted file mode 100644')
  else if (file.status === 'renamed')
    lines.push(`rename from ${oldPath}`, `rename to ${newPath}`)
  else if (file.status === 'copied')
    lines.push(`copy from ${oldPath}`, `copy to ${newPath}`)
  lines.push(`--- ${file.status === 'added' ? '/dev/null' : `a/${oldPath}`}`)
  lines.push(`+++ ${file.status === 'removed' ? '/dev/null' : `b/${newPath}`}`)
  for (const hunk of file.hunks) lines.push(hunk.header, hunk.patch)
  return lines.join('\n')
}

/** Pierre diff input for `file`, complete (whole-file highlighting) when `contents` is given. */
export function buildFileDiff(
  file: FileChange,
  contents?: FullFileContents,
): FileDiffMetadata | undefined {
  const oldPath = file.previousPath ?? file.path
  return processFile(
    buildUnifiedDiffText(file),
    contents
      ? {
          oldFile:
            contents.old !== undefined ? { name: oldPath, contents: contents.old } : undefined,
          newFile:
            contents.new !== undefined ? { name: file.path, contents: contents.new } : undefined,
        }
      : undefined,
  )
}

/**
 * Pierre highlights each hunk of a patch-only diff on its own, from the top-level grammar
 * state. A hunk that starts past line 1 can begin inside a string or comment opened in
 * the lines it hides, and then render with wrong colors - only the full file avoids that.
 * An added or removed file's patch already is the whole file.
 */
export function needsFullFileToHighlight(file: FileChange): boolean {
  if (file.isBinary || file.truncated || file.status === 'added' || file.status === 'removed')
    return false
  return file.hunks.some(hunk => hunk.oldStart > 1 || hunk.newStart > 1)
}
