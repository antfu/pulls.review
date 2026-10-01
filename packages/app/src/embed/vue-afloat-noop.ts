// `vue-afloat` (tooltips/dropdowns, pulled in transitively via `@antfu/design`'s
// `ActionIconButton`/`DisplayFilePath`/etc. through the `v-tooltip` directive) teleports
// its popper content to `document.body` - which, inside a Shadow DOM custom element,
// escapes the shadow root entirely and renders unstyled directly in the host page
// (github.com). Aliased (see `vite.embed.config.ts`) to this no-op stub instead of
// fixing that properly for now: every named export vue-afloat ships, inert.
import type { Component, Directive } from 'vue'

const noopDirective: Directive = {}
const noopComponent: Component = { render: () => null }

export const vTooltip: Directive = noopDirective
export const vClosePopper: Directive = noopDirective
export const Tooltip: Component = noopComponent
export const Dropdown: Component = noopComponent
export const Menu: Component = noopComponent
export const PopperContent: Component = noopComponent
export const placements: string[] = []
export function createTooltip(): undefined {
  return undefined
}
export function destroyTooltip(): void {}
export function createPopper(): undefined {
  return undefined
}
export function createAfloatComponent(): Component {
  return noopComponent
}
export function getResolvedOptions(): Record<string, never> {
  return {}
}
export function hideAllPoppers(): void {}
export function recomputeAllPoppers(): void {}
export function install(): void {}

export default { install }
