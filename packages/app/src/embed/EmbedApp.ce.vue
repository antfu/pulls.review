<script setup lang="ts">
import type { EmbedPr, ReviewLink } from './githubIntegration'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useAppContext } from '../app-context'
import SettingsModal from '../components/settings/SettingsModal.vue'
import { i18n } from '../i18n'
import { settingsModalOpen } from '../state/settingsModal'
import { useEmbedDark } from './dark'
import EmbedPrView from './EmbedPrView.vue'
import { hijackReviewLinks, injectGithubPageStyles, keepToggleTab, setPanelOpenWidth, SITE_ORIGIN, syncToggleTab } from './githubIntegration'
import { USERSCRIPT_URL, useUserscriptUpdate } from './userscript-update'

const WIDTH_STORAGE_KEY = 'diffs-embed:drawer-width'
const DEFAULT_WIDTH = 800
const MIN_WIDTH = 320

function parsePr(pathname: string): EmbedPr | undefined {
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
// Not `useI18n()`: inside a custom element it needs its own `provide`; the global composer is the one installed anyway.
const { t } = i18n.global
const { updateAvailable } = useUserscriptUpdate(useAppContext().credentials)

const pr = ref(parsePr(location.pathname))
const prKey = computed(() => pr.value && `${pr.value.owner}/${pr.value.repo}#${pr.value.number}`)
const open = ref(false)
const width = ref(loadWidth())

// `EmbedPrView` loads eagerly (mounted while closed too), so the dot can light up before the drawer is ever opened.
const prView = useTemplateRef<InstanceType<typeof EmbedPrView>>('prView')
const hasSharedResult = computed(() => {
  const store = prView.value?.store
  return !!store?.shared?.candidates.length || !!store?.aiResult?.sharedBy
})

// GitHub is a Turbo (Hotwire) SPA - navigating between PRs (or to/from one) doesn't
// reload the page (and so doesn't remount this custom element), so re-derive the
// current PR on every Turbo navigation too. `:key="prKey"` below gives `EmbedPrView` a
// fresh instance (and fresh data fetch) per PR, same as a routed page's fresh mount.
function syncPr() {
  pr.value = parsePr(location.pathname)
  if (pr.value)
    injectGithubPageStyles()
  else
    open.value = false
}

function toggleOpen() {
  open.value = !open.value
}

function syncTab() {
  if (pr.value)
    syncToggleTab({ label: t('embed.reviewChanges'), hasSharedResult: hasSharedResult.value && !open.value, sharedResultTitle: t('pulls.aiAvailable') }, toggleOpen)
}
// Re-renders the light-DOM tab on PR, locale and dot changes; `keepToggleTab` covers
// GitHub removing it (Turbo swapping the tab bar, React hydration re-rendering it).
watchEffect(syncTab)

function openFromLink(link: ReviewLink) {
  open.value = true
  if (link.from)
    void prView.value?.store.shared?.load(link.from)
}

// The drawer only ever renders inside this component's own shadow root; the body
// class and `<html>` width are how GitHub's own page finds out it's open, and how wide.
watch([open, width], ([isOpen, w]) => {
  setPanelOpenWidth(isOpen ? w : undefined)
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

let stopHijackingLinks: (() => void) | undefined
let stopKeepingTab: (() => void) | undefined
onMounted(() => {
  // Turbo's own navigation event always fires on the real top-level document,
  // regardless of where this custom element is mounted - not the shadow root.
  window.document.addEventListener('turbo:load', syncPr)
  window.addEventListener('popstate', syncPr)
  stopHijackingLinks = hijackReviewLinks({ pr: () => pr.value, onOpen: openFromLink, launchLabel: () => t('pr.openInSite') })
  stopKeepingTab = keepToggleTab(syncTab)
  if (pr.value)
    injectGithubPageStyles()
})
onBeforeUnmount(() => {
  window.document.removeEventListener('turbo:load', syncPr)
  window.removeEventListener('popstate', syncPr)
  stopHijackingLinks?.()
  stopKeepingTab?.()
  setPanelOpenWidth(undefined)
})
</script>

<template>
  <div ref="root">
    <button
      v-if="pr && !open"
      type="button"
      class="z-[2147483000] [writing-mode:vertical-rl] fixed right-0 top-1/2 border border-r-0 border-base rounded-l-lg bg-base px-2 py-2.5 text-xs color-base font-semibold shadow-lg -translate-y-1/2"
      @click="toggleOpen"
    >
      {{ $t('embed.reviewChanges') }}
      <span v-if="hasSharedResult" class="absolute left-0 top-0 h-2.5 w-2.5 border-2 border-base rounded-full bg-blue-500 -translate-x-1/3 -translate-y-1/3" :title="$t('pulls.aiAvailable')" />
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
        <ActionButton v-if="updateAvailable" :href="USERSCRIPT_URL" target="_blank" rel="noopener noreferrer" size="sm" icon="i-ph-arrow-circle-up-duotone">
          {{ $t('embed.updateUserscript') }}
        </ActionButton>
        <a v-if="pr" target="_blank" :href="`${SITE_ORIGIN}/gh/${pr.owner}/${pr.repo}/${pr.number}`" rel="noopener noreferrer" :aria-label="$t('pr.openInSite')" class="op-fade hover:op-100">
          <div class="i-ph-arrow-square-out-duotone" />
        </a>
        <button type="button" :aria-label="$t('common.close')" class="op-fade hover:op-100" @click="toggleOpen">
          <div class="i-ph-x" />
        </button>
      </header>
      <EmbedPrView
        v-if="pr"
        ref="prView"
        :key="prKey" :owner="pr.owner" :repo="pr.repo" :number="pr.number" :document="document" class="min-h-0 flex-1 overflow-auto"
      />
    </div>

    <SettingsModal v-model:open="settingsModalOpen" :document="document" />
  </div>
</template>
