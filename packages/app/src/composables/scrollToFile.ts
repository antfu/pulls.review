const MAX_CORRECTIONS = 5
const TOLERANCE_PX = 2

/**
 * Smooth-scrolls to the non-sticky `[data-file-start]` marker of a file (its own header is
 * sticky, so its rect doesn't follow the file once stuck). Diffs above the target keep
 * growing while the scroll is in flight, so each `scrollend` re-aims until the marker sits
 * at its scroll-margin.
 */
export function scrollToFile(root: ParentNode, sha: string) {
  const marker = root.querySelector(`[data-file-start="${sha}"]`)
  if (!marker)
    return
  const margin = Number.parseFloat(getComputedStyle(marker).scrollMarginTop)
  const isSettled = () => Math.abs(marker.getBoundingClientRect().top - margin) <= TOLERANCE_PX

  let corrections = 0
  function onScrollEnd() {
    if (isSettled() || corrections++ >= MAX_CORRECTIONS) {
      window.removeEventListener('scrollend', onScrollEnd, { capture: true })
      return
    }
    marker!.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (isSettled())
    return
  window.addEventListener('scrollend', onScrollEnd, { capture: true })
  marker.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
