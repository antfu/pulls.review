// @pierre/diffs's `FileDiff` class renders into a shadow root but never adopts its own
// "core" stylesheet there when used outside its `<diffs-container>` custom element (that
// element - dist/components/web-components.js - adopts it in its constructor, but isn't
// part of the package's public `exports` map, so we can't import it directly). Without it,
// diffs render structurally correct (line numbers, hunk collapsing) but with no diff
// colors/backgrounds at all. This file is a vendored copy of that same core CSS (extracted
// from node_modules/@pierre/diffs/dist/style.js, pinned to @pierre/diffs@1.4.2 - re-extract
// if that dependency is upgraded and diffs go unstyled again), adopted manually into each
// FileDiff's shadow root before rendering.
import coreCss from './pierre-diffs-core.css?raw'

let sheet: CSSStyleSheet | undefined

export function ensurePierreDiffsShadowRoot(container: HTMLElement): ShadowRoot {
  const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
  sheet ??= (() => {
    const s = new CSSStyleSheet()
    s.replaceSync(coreCss)
    return s
  })()
  if (!shadowRoot.adoptedStyleSheets.includes(sheet))
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet]
  return shadowRoot
}
