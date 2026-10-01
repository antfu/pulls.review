// DOM integration with github.com's own PR page, outside this component's shadow
// root entirely - `[id="diff-comparison-viewer-container"]` and
// `[id="prs-files-anchor-tab"]` are GitHub's own elements, on the real page. Never
// touches `document.documentElement` (see `dark.ts`'s own comment on why) - only
// `document.body` and elements inside it.

export const PANEL_OPEN_CLASS = 'diffs-panel-open'

const STYLE_ID = 'diffs-embed-page-style'
const FILES_TAB_ID = 'prs-files-anchor-tab'
const TOGGLE_TAB_ID = 'diffs-toggle-tab'

/** Idempotent - safe to call on every Turbo navigation, not just once. */
export function injectGithubPageStyles(): void {
  if (window.document.getElementById(STYLE_ID))
    return
  const style = window.document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* style injected by pulls.review integration */
#${FILES_TAB_ID} { opacity: 0.6; }
.${PANEL_OPEN_CLASS} [id="diff-comparison-viewer-container"] { margin-left: 0 !important; }
.${PANEL_OPEN_CLASS} [data-component="PageHeader"] [data-component="TitleArea"] { margin-left: 0 !important; }
`
  window.document.head.appendChild(style)
}

/**
 * Fades GitHub's own "Files changed" tab and inserts a `Diffs` toggle button
 * right before it - a `<button>`, not a link, since it doesn't navigate anywhere.
 * Turbo re-renders the tab bar on every PR navigation, wiping out our button along
 * with it, so this re-checks (and re-inserts if needed) rather than running once.
 */
export function setupFilesTabToggle(onToggle: () => void): void {
  if (window.document.getElementById(TOGGLE_TAB_ID))
    return
  const filesTab = window.document.getElementById(FILES_TAB_ID)
  if (!filesTab)
    return

  const button = window.document.createElement('button')
  button.id = TOGGLE_TAB_ID
  button.type = 'button'
  // Copies the real tab's own classes, so it matches GitHub's current styling
  // (colors, spacing, hover state) without hardcoding any of it here.
  button.className = filesTab.className
  button.textContent = 'pulls.review'
  button.addEventListener('click', onToggle)

  const filesTabListItem = filesTab.closest('li')
  if (filesTabListItem) {
    const listItem = window.document.createElement('li')
    listItem.append(button)
    filesTabListItem.before(listItem)
  }
  else {
    filesTab.before(button)
  }
}
