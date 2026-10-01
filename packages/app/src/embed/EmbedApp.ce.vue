<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import SettingsModal from '../components/settings/SettingsModal.vue'
import { settingsModalOpen } from '../state/settingsModal'
import { useEmbedDark } from './dark'
import EmbedPrView from './EmbedPrView.vue'
import { injectGithubPageStyles, PANEL_OPEN_CLASS, setupFilesTabToggle } from './githubIntegration'

const WIDTH_STORAGE_KEY = 'diffs-embed:drawer-width'
const DEFAULT_WIDTH = 800
const MIN_WIDTH = 320

interface Pr {
  owner: string
  repo: string
  number: string
}

function parsePr(pathname: string): Pr | undefined {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match)
    return undefined
  return { owner: match[1]!, repo: match[2]!, number: match[3]! }
}

function clampWidth(width: number): number {
  const max = Math.round(window.innerWidth * 0.92)
  return Math.min(Math.max(width, MIN_WIDTH), max)
}

function loadWidth(): number {
  const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
  if (!Number.isFinite(stored) || stored <= 0)
    return DEFAULT_WIDTH
  return clampWidth(stored)
}

const rootRef = useTemplateRef<HTMLDivElement>('root')
useEmbedDark(rootRef)

const pr = ref(parsePr(location.pathname))
const prKey = computed(() => pr.value && `${pr.value.owner}/${pr.value.repo}#${pr.value.number}`)
const open = ref(false)
const width = ref(loadWidth())

// GitHub is a Turbo (Hotwire) SPA - navigating between PRs (or to/from one) doesn't
// reload the page (and so doesn't remount this custom element), so re-derive the
// current PR on every Turbo navigation too. `:key="prKey"` below gives `EmbedPrView` a
// fresh instance (and fresh data fetch) per PR, same as a routed page's fresh mount.
function syncPr() {
  pr.value = parsePr(location.pathname)
  if (!pr.value) {
    open.value = false
    return
  }
  // Turbo swaps in a fresh tab bar per PR navigation, taking our inserted button
  // with it - re-run both on every navigation, not just the initial mount.
  injectGithubPageStyles()
  setupFilesTabToggle(toggleOpen)
}

function toggleOpen() {
  open.value = !open.value
}

// The drawer only ever renders inside this component's own shadow root, but
// `[id="diff-comparison-viewer-container"]` is GitHub's own element on the real
// page - toggling this class there is how it finds out the drawer is open.
watch(open, (isOpen) => {
  window.document.body.classList.toggle(PANEL_OPEN_CLASS, isOpen)
})

let dragStartX = 0
let dragStartWidth = 0
function onResizeMove(event: PointerEvent) {
  width.value = clampWidth(dragStartWidth + (dragStartX - event.clientX))
}
function onResizeUp(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  handle.removeEventListener('pointermove', onResizeMove)
  handle.removeEventListener('pointerup', onResizeUp)
  localStorage.setItem(WIDTH_STORAGE_KEY, String(width.value))
}
function onResizeDown(event: PointerEvent) {
  event.preventDefault()
  dragStartX = event.clientX
  dragStartWidth = width.value
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  handle.addEventListener('pointermove', onResizeMove)
  handle.addEventListener('pointerup', onResizeUp)
}

// Named `document` (not `hostContainer`) deliberately: shadowing the global forces
// every reference below to make an explicit choice between "this component's
// document" and `window.document`, the actual top-level one - the same mistake
// class as the earlier bug where `ownerDocument` (always the top `Document`, even
// for a shadow-tree node) was used where `getRootNode()` (the actual ShadowRoot)
// was needed. Anything mounting/querying "within this component" (the quick-nav
// scroll target, AppModal's Teleport target) should read this, not the bare global.
const document = computed(() => (rootRef.value?.getRootNode() ?? window.document) as Document | ShadowRoot)

onMounted(() => {
  // Turbo's own navigation event always fires on the real top-level document,
  // regardless of where this custom element is mounted - not the shadow root.
  window.document.addEventListener('turbo:load', syncPr)
  window.addEventListener('popstate', syncPr)
  if (pr.value) {
    injectGithubPageStyles()
    setupFilesTabToggle(toggleOpen)
  }
})
onBeforeUnmount(() => {
  window.document.removeEventListener('turbo:load', syncPr)
  window.removeEventListener('popstate', syncPr)
  window.document.body.classList.remove(PANEL_OPEN_CLASS)
})
</script>

<template>
  <div ref="root">
    <button
      v-if="pr"
      type="button"
      class="z-[2147483000] [writing-mode:vertical-rl] fixed right-0 top-1/2 border border-r-0 border-base rounded-l-lg bg-base px-2 py-2.5 text-xs color-base font-semibold shadow-lg -translate-y-1/2"
      :style="{ right: open ? `${width}px` : '0' }"
      @click="toggleOpen"
    >
      pulls.review
    </button>

    <div
      v-if="pr"
      class="z-[2147483001] fixed right-0 top-0 h-full flex flex-col border-l border-base bg-base color-base shadow-2xl transition-transform"
      :style="{ width: `${width}px`, maxWidth: '92vw', transform: open ? 'translateX(0)' : 'translateX(100%)' }"
    >
      <div
        class="z-1 absolute left-0 top-0 h-full w-2 cursor-ew-resize -translate-x-1/2"
        @pointerdown="onResizeDown"
      />
      <header class="flex shrink-0 items-center gap-2 border-b border-base px-3 py-2 text-sm font-semibold">
        <div class="flex-auto">
          pulls.review
        </div>
        <a v-if="pr" target="_blank" :href="`https://pulls.review/gh/${pr.owner}/${pr.repo}/${pr.number}`" rel="noopener noreferrer" :aria-label="$t('pr.openInSite')" class="op-fade hover:op-100">
          <div class="i-ph-arrow-square-out-duotone" />
        </a>
        <button type="button" :aria-label="$t('common.close')" class="op-fade hover:op-100" @click="toggleOpen">
          <div class="i-ph-x" />
        </button>
      </header>
      <EmbedPrView
        v-if="pr"
        :key="prKey" :owner="pr.owner" :repo="pr.repo" :number="pr.number" :document="document" class="min-h-0 flex-1 overflow-auto"
      />
    </div>

    <SettingsModal v-model:open="settingsModalOpen" :document="document" />
  </div>
</template>
