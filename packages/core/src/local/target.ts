/** A local review target, written in git's own revision syntax (see plans/04). */
export type LocalTarget
  = | { kind: 'worktree' }
    | { kind: 'commit', rev: string }
    | { kind: 'range', base: string, head: string, mergeBase: boolean }

function revision(rev: string, target: string): string {
  // Passed to git as an argument: never let a revision read as an option.
  if (rev.startsWith('-'))
    throw new Error(`Invalid revision in target "${target}".`)
  // As in git, an empty side of a range means HEAD.
  return rev || 'HEAD'
}

/** `''` is the working tree, `A...B` a merge-base range, `A..B` a tree diff, anything else one commit. */
export function parseTarget(target: string): LocalTarget {
  const text = target.trim()
  if (!text)
    return { kind: 'worktree' }
  for (const [separator, mergeBase] of [['...', true], ['..', false]] as const) {
    const at = text.indexOf(separator)
    if (at !== -1) {
      return {
        kind: 'range',
        base: revision(text.slice(0, at), target),
        head: revision(text.slice(at + separator.length), target),
        mergeBase,
      }
    }
  }
  return { kind: 'commit', rev: revision(text, target) }
}
