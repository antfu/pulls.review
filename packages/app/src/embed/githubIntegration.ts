// DOM integration with github.com's own PR page, outside this component's shadow
// root entirely - `[id="diff-comparison-viewer-container"]`, `[id="pr-conversation-sidebar"]`
// and `[id="prs-files-anchor-tab"]` are GitHub's own elements, on the real page. The
// only touch on `document.documentElement` is the inline width while the drawer is
// open (see `dark.ts` on why its classes are otherwise off limits); everything else
// stays on `document.body` and elements inside it.

export const SITE_ORIGIN = 'https://pulls.review'
export const PANEL_OPEN_CLASS = 'diffs-panel-open'

const STYLE_ID = 'diffs-embed-page-style'
const FILES_TAB_ID = 'prs-files-anchor-tab'
const TOGGLE_TAB_ID = 'diffs-toggle-tab'
const TAB_LABEL_CLASS = 'pulls-review-tab-label'
const TAB_DOT_CLASS = 'pulls-review-tab-dot'
const LAUNCH_CLASS = 'pulls-review-launch'
const HIJACKED_ATTR = 'data-pulls-review'

export interface EmbedPr {
  owner: string
  repo: string
  number: string
}

// public/favicon.svg, in `currentColor` so it sits next to GitHub's muted octicons.
const LOGO_SVG = `<svg viewBox="0 0 64 64" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="17" y="5.5" width="36" height="7.5" rx="3.75"/><rect x="17" y="16" width="15" height="7.5" rx="3.75" opacity="0.4"/><rect x="34.5" y="16" width="24" height="7.5" rx="3.75"/><rect x="17" y="26.5" width="28" height="7.5" rx="3.75" opacity="0.5"/><rect x="17" y="40.5" width="11" height="7.5" rx="3.75" opacity="0.4"/><rect x="30.5" y="40.5" width="18" height="7.5" rx="3.75"/><rect x="17" y="51" width="24" height="7.5" rx="3.75" opacity="0.6"/><path d="M12 5.5h-4v28.5h4M12 40.5h-4v18h4" fill="none" stroke="currentColor" stroke-width="3.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`
// octicon:link-external-16
const LAUNCH_SVG = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2m6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03L9.28 7.78a.75.75 0 0 1-1.042-.018a.75.75 0 0 1-.018-1.042l3.75-3.75l-1.543-1.543A.25.25 0 0 1 10.604 1"/></svg>`

/** Idempotent - safe to call on every Turbo navigation, not just once. */
export function injectGithubPageStyles(): void {
  if (window.document.getElementById(STYLE_ID))
    return
  const style = window.document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* style injected by pulls.review integration */
#${FILES_TAB_ID} { opacity: 0.6; }
#${TOGGLE_TAB_ID} > svg { vertical-align: text-bottom; margin-right: 8px; color: var(--fgColor-muted); }
.${TAB_DOT_CLASS} { display: inline-block; width: 8px; height: 8px; margin-left: 6px; border-radius: 50%; vertical-align: middle; background: var(--bgColor-accent-emphasis, #0969da); }
.${TAB_DOT_CLASS}[hidden] { display: none; }
.${LAUNCH_CLASS} { display: inline-block; margin-left: 4px; vertical-align: text-bottom; color: var(--fgColor-muted); }
.${PANEL_OPEN_CLASS} [id="diff-comparison-viewer-container"] { margin-left: 0 !important; }
.${PANEL_OPEN_CLASS} [data-component="PageHeader"] [data-component="TitleArea"] { margin-left: 0 !important; }
.${PANEL_OPEN_CLASS} :has(> [id="pr-conversation-sidebar"]) { display: none !important; }
`
  window.document.head.appendChild(style)
}

/**
 * Tells the page the drawer is open and how wide: the body class drives the injected
 * rules above, and `<html>` shrinks to the remaining space so GitHub's own layout
 * reflows beside the drawer instead of underneath it. `undefined` = closed.
 */
export function setPanelOpenWidth(width: number | undefined): void {
  window.document.body.classList.toggle(PANEL_OPEN_CLASS, width !== undefined)
  const remaining = width === undefined ? '' : `calc(100% - ${width}px)`
  const html = window.document.documentElement
  html.style.width = remaining
  html.style.maxWidth = remaining
}

export interface ToggleTabState {
  label: string
  /** Shown as a dot on the tab when a shared AI analysis exists for this PR. */
  hasSharedResult: boolean
  sharedResultTitle: string
}

/**
 * Fades GitHub's own "Files changed" tab and inserts a toggle button right before it -
 * a `<button>`, not a link, since it doesn't navigate anywhere. Turbo re-renders the
 * tab bar on every PR navigation, wiping out our button along with it, so this
 * re-checks (and re-inserts if needed) rather than running once; an existing button
 * just gets its label and dot updated.
 */
export function syncToggleTab(state: ToggleTabState, onToggle: () => void): void {
  const button = window.document.getElementById(TOGGLE_TAB_ID) ?? createToggleTab(onToggle)
  if (!button)
    return
  button.querySelector(`.${TAB_LABEL_CLASS}`)!.textContent = state.label
  const dot = button.querySelector<HTMLElement>(`.${TAB_DOT_CLASS}`)!
  dot.hidden = !state.hasSharedResult
  dot.title = state.sharedResultTitle
}

function createToggleTab(onToggle: () => void): HTMLButtonElement | undefined {
  const filesTab = window.document.getElementById(FILES_TAB_ID)
  if (!filesTab)
    return undefined

  const button = window.document.createElement('button')
  button.id = TOGGLE_TAB_ID
  button.type = 'button'
  // Copies the real tab's own classes, so it matches GitHub's current styling
  // (colors, spacing, hover state) without hardcoding any of it here.
  button.className = filesTab.className
  button.innerHTML = `${LOGO_SVG}<span class="${TAB_LABEL_CLASS}"></span><span class="${TAB_DOT_CLASS}"></span>`
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
  return button
}

export interface ReviewLink extends EmbedPr {
  /** The `?from=` login - whose shared analysis to load. */
  from?: string
}

/** `https://pulls.review/gh/{owner}/{repo}/{number}[?from=login]`, or `undefined` for any other URL. */
export function parseReviewLink(href: string): ReviewLink | undefined {
  const url = new URL(href, SITE_ORIGIN)
  if (url.origin !== SITE_ORIGIN)
    return undefined
  const match = url.pathname.match(/^\/gh\/([^/]+)\/([^/]+)\/(\d+)\/?$/)
  if (!match)
    return undefined
  return { owner: match[1]!, repo: match[2]!, number: match[3]!, from: url.searchParams.get('from') ?? undefined }
}

export interface HijackReviewLinksOptions {
  /** The PR the page is showing right now - links to any other PR are left alone. */
  pr: () => EmbedPr | undefined
  onOpen: (link: ReviewLink) => void
  /** Accessible name of the appended "open in a new tab" icon. */
  launchLabel: () => string
}

/**
 * Links to this PR on pulls.review (the shared-analysis comment's own, typically) open
 * in the drawer instead of leaving the page; each gets a trailing icon that still opens
 * the site in a new tab. GitHub renders comments lazily, so this keeps watching the
 * page for new links until the returned stop function runs.
 */
export function hijackReviewLinks(opts: HijackReviewLinksOptions): () => void {
  function decorate() {
    const pr = opts.pr()
    if (!pr)
      return
    const anchors = window.document.querySelectorAll<HTMLAnchorElement>(`a[href^="${SITE_ORIGIN}/gh/"]:not([${HIJACKED_ATTR}])`)
    for (const anchor of anchors) {
      const link = parseReviewLink(anchor.href)
      if (!link || link.owner !== pr.owner || link.repo !== pr.repo || link.number !== pr.number)
        continue
      anchor.setAttribute(HIJACKED_ATTR, '')
      anchor.addEventListener('click', (event) => {
        event.preventDefault()
        opts.onOpen(link)
      })
      const launch = window.document.createElement('a')
      launch.className = LAUNCH_CLASS
      // Same href as the link it follows - without this it would be picked up on the next pass.
      launch.setAttribute(HIJACKED_ATTR, '')
      launch.href = anchor.href
      launch.target = '_blank'
      launch.rel = 'noopener noreferrer'
      launch.setAttribute('aria-label', opts.launchLabel())
      launch.innerHTML = LAUNCH_SVG
      anchor.after(launch)
    }
  }

  decorate()
  const observer = new MutationObserver(decorate)
  observer.observe(window.document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
