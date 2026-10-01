<script setup lang="ts">
import type { DiffLineAnnotation, FileDiffOptions, SelectedLineRange } from '@pierre/diffs'
import type { CommentThread, DiffSide, FileChange, ReviewDraftTarget } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import { FileDiff as PierreFileDiff, processFile, VirtualizedFileDiff } from '@pierre/diffs'
import { fetchFileContentAtRef } from '@pulls.review/core/github'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { getCachedFileContent, setCachedFileContent } from '../../cache/file-content-cache'
import { getDefaultCacheStorage } from '../../cache/storage'
import { isDark as globalIsDark, isDarkKey } from '../../state/dark'
import { settings } from '../../state/settings'
import CommentComposer from './CommentComposer.vue'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffStats from './DiffStats.vue'
import { fileContentContextKey } from './file-content-context'
import FileStatus from './FileStatus.vue'
import { isNoisyFile } from './noisy-files'
import { ensurePierreDiffsShadowRoot } from './pierre-diffs-shadow'
import { reviewStatus } from './review-status'
import ReviewCheckbox from './ReviewCheckbox.vue'
import ReviewThreadCard from './ReviewThreadCard.vue'

const props = defineProps<{
  store: DiffsStore
  file: FileChange
}>()

const status = computed(() => reviewStatus(props.store, props.file))
const isReviewed = computed(() => status.value === 'reviewed')

// Reads the embed's own scoped ref when provided (see `state/dark.ts`), otherwise the
// app-wide singleton - never targets `document.documentElement` from inside the embed.
const isDark = inject(isDarkKey, globalIsDark)
// `undefined` for a source that can't refetch full file content (see `file-content-context.ts`).
const fileContentContext = inject(fileContentContextKey, undefined)
const virtualizer = inject(diffVirtualizerKey, undefined)

const containerRef = useTemplateRef<HTMLDivElement>('container')
const collapsed = ref(isReviewed.value || isNoisyFile(props.file.path))
let instance: PierreFileDiff | undefined

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
  for (const hunk of file.hunks)
    lines.push(hunk.header, hunk.patch)
  return lines.join('\n')
}

// Full file content, fetched on demand (see `loadFullFile`) and cached by
// `(path, ref sha)` - `undefined` means "not fetched" for a side that *could* exist,
// distinct from a side that structurally doesn't (an added file's old side, a removed
// file's new side), which `loadFullFile` never even tries to fetch.
const fullOldContent = ref<string>()
const fullNewContent = ref<string>()
const isLoadingFullFile = ref(false)
const fullFileError = ref<Error>()
const fullFileLoaded = computed(() => fullOldContent.value !== undefined || fullNewContent.value !== undefined)
const canLoadFullFile = computed(() => !!fileContentContext?.value && !props.file.isBinary && !fullFileLoaded.value)

async function loadFileSide(path: string, sha: string, token: string | undefined, owner: string, repo: string): Promise<string | undefined> {
  const storage = await getDefaultCacheStorage()
  const cached = await getCachedFileContent(storage, path, sha)
  if (cached !== undefined)
    return cached
  const content = await fetchFileContentAtRef(owner, repo, path, sha, token)
  if (content !== undefined)
    await setCachedFileContent(storage, path, sha, content)
  return content
}

async function loadFullFile() {
  const context = fileContentContext?.value
  if (!context || isLoadingFullFile.value || fullFileLoaded.value)
    return

  isLoadingFullFile.value = true
  fullFileError.value = undefined
  try {
    const { owner, repo, baseSha, headSha } = context
    const token = settings.value.githubToken || undefined
    const oldPath = props.file.previousPath ?? props.file.path
    const [oldContent, newContent] = await Promise.all([
      props.file.status === 'added' ? undefined : loadFileSide(oldPath, baseSha, token, owner, repo),
      props.file.status === 'removed' ? undefined : loadFileSide(props.file.path, headSha, token, owner, repo),
    ])
    fullOldContent.value = oldContent
    fullNewContent.value = newContent
  }
  catch (err) {
    fullFileError.value = err instanceof Error ? err : new Error(String(err))
  }
  finally {
    isLoadingFullFile.value = false
  }
}

// Pierre can only expand "N unmodified lines" when it has the full file contents, which a
// bare patch lacks - so the first click on one of its expand controls fetches the file, then
// replays that click's expansion on the re-rendered diff (pierre keeps no state for it).
interface PendingExpand { index: number, direction: 'up' | 'down' | 'both' }

function readExpandTarget(event: Event): PendingExpand | undefined {
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement))
      continue
    if (!node.hasAttribute('data-expand-button') && !node.hasAttribute('data-unmodified-lines'))
      continue
    const index = Number(node.getAttribute('data-expand-index'))
    if (Number.isNaN(index))
      return
    const direction = node.hasAttribute('data-expand-up')
      ? 'up'
      : node.hasAttribute('data-expand-down') ? 'down' : 'both'
    return { index, direction: node.hasAttribute('data-expand-all-button') || (event as MouseEvent).shiftKey ? 'both' : direction }
  }
}

async function onExpandClick(event: Event) {
  if (!canLoadFullFile.value)
    return
  const target = readExpandTarget(event)
  if (!target)
    return
  await loadFullFile()
  if (!fullFileLoaded.value)
    return
  await nextTick()
  instance?.expandHunk(target.index, target.direction, target.direction === 'both' ? Number.POSITIVE_INFINITY : undefined)
}

const fileDiff = computed(() => {
  if (collapsed.value || props.file.isBinary)
    return
  const oldPath = props.file.previousPath ?? props.file.path
  return processFile(buildUnifiedDiffText(props.file), fullFileLoaded.value
    ? {
        oldFile: fullOldContent.value !== undefined ? { name: oldPath, contents: fullOldContent.value } : undefined,
        newFile: fullNewContent.value !== undefined ? { name: props.file.path, contents: fullNewContent.value } : undefined,
      }
    : undefined)
})

// Container width, tracked for `effectiveLayout` below - a `ResizeObserver` rather than
// a viewport-width media query since this is per-file-diff container width (the sidebar/
// content grid in `DiffGroup.vue` means it's not the same as the viewport).
const containerWidth = ref(0)
let resizeObserver: ResizeObserver | undefined
watch(containerRef, (el, previousEl) => {
  if (previousEl)
    resizeObserver?.unobserve(previousEl)
  if (el) {
    resizeObserver ??= new ResizeObserver((entries) => {
      containerWidth.value = entries[0]?.contentRect.width ?? 0
    })
    resizeObserver.observe(el)
  }
}, { immediate: true })
onBeforeUnmount(() => resizeObserver?.disconnect())

// --- Review comment threads (github only - `store.reviews` is undefined elsewhere) ---

const reviews = computed(() => props.store.reviews)

// Resolved and outdated threads are hidden by design; the global toggle hides
// submitted threads but never the viewer's own pending drafts.
const visibleThreads = computed(() => {
  const r = reviews.value
  if (!r)
    return []
  return r.threads.filter(thread =>
    thread.path === props.file.path
    && thread.line !== undefined
    && !thread.outdated
    && thread.resolved !== true
    && (r.showThreads || thread.pending))
})

const resolvedCount = computed(() =>
  reviews.value?.threads.filter(thread => thread.path === props.file.path && thread.resolved === true).length ?? 0)

const draftTarget = ref<ReviewDraftTarget>()
const draftBusy = ref(false)
const draftError = ref<string>()

interface AnnotationGroup {
  side: DiffSide
  line: number
  threads: CommentThread[]
  hasDraft: boolean
}

// One annotation (and one slotted wrapper) per anchor line: pierre emits one
// shadow-DOM `<slot>` per annotation, and duplicate slot names would swallow
// all but the first wrapper - so threads sharing a line stack in one group.
const annotationGroups = computed<AnnotationGroup[]>(() => {
  const groups = new Map<string, AnnotationGroup>()
  function groupFor(side: DiffSide, line: number): AnnotationGroup {
    const key = `${side}-${line}`
    let group = groups.get(key)
    if (!group) {
      group = { side, line, threads: [], hasDraft: false }
      groups.set(key, group)
    }
    return group
  }
  for (const thread of visibleThreads.value)
    groupFor(thread.side, thread.line!).threads.push(thread)
  if (draftTarget.value)
    groupFor(draftTarget.value.side, draftTarget.value.line).hasDraft = true
  return [...groups.values()]
})

const lineAnnotations = computed<DiffLineAnnotation[]>(() =>
  annotationGroups.value.map(group => ({ side: group.side, lineNumber: group.line })))

const canComment = computed(() => (reviews.value?.canWrite ?? false) && !props.file.isBinary)

function openDraft(range: SelectedLineRange) {
  const side: DiffSide = range.endSide ?? range.side ?? 'additions'
  const line = Math.max(range.start, range.end)
  const startLine = Math.min(range.start, range.end)
  draftTarget.value = {
    path: props.file.path,
    side,
    line,
    ...(startLine < line ? { startLine, startSide: range.side ?? side } : {}),
  }
  draftError.value = undefined
}

async function submitDraft(body: string, mode: 'single' | 'review') {
  const target = draftTarget.value
  const r = reviews.value
  if (!target || !r)
    return
  draftBusy.value = true
  draftError.value = undefined
  try {
    await r.addComment(target, body, mode)
    draftTarget.value = undefined
  }
  catch (err) {
    draftError.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    draftBusy.value = false
  }
}

const MIN_SPLIT_WIDTH_PX = 640

// Forces `unified` regardless of the user's global layout preference when a split view
// wouldn't fit (container too narrow for two columns) or wouldn't show anything useful
// (a file that's purely additions or purely deletions has nothing on the other side).
const isOneSided = computed(() => props.file.additions === 0 || props.file.deletions === 0)
const effectiveLayout = computed<'split' | 'unified'>(() => {
  if (props.store.ui.layout === 'unified' || isOneSided.value)
    return 'unified'
  if (containerWidth.value > 0 && containerWidth.value < MIN_SPLIT_WIDTH_PX)
    return 'unified'
  return props.store.ui.layout
})

const pierreOptions = computed((): FileDiffOptions<undefined, undefined> => ({
  diffStyle: effectiveLayout.value,
  themeType: isDark.value ? 'dark' : 'light',
  disableErrorHandling: false,
  disableFileHeader: true,
  // The library's built-in hover "+" gutter button and drag line-selection -
  // the click hands us the hovered line or selected range to anchor a draft on.
  ...(canComment.value
    ? {
        enableGutterUtility: true,
        enableLineSelection: true,
        onGutterUtilityClick: openDraft,
      }
    : {}),
}))

function mount() {
  // Recreated on every render rather than reused + `setOptions()`: switching `diffStyle`
  // (unified/split) on an existing instance left stale, un-columned DOM behind. `cleanUp()`
  // would otherwise `.remove()` our own template-owned container from the DOM entirely
  // (its default assumption is that it created the container itself) - the third
  // `isContainerManaged: true` constructor arg opts out of that.
  instance?.cleanUp()

  if (!containerRef.value || props.file.isBinary || collapsed.value || !fileDiff.value)
    return

  const shadowRoot = ensurePierreDiffsShadowRoot(containerRef.value)
  // Idempotent: the same listener function is only ever registered once per shadow root.
  shadowRoot.addEventListener('click', onExpandClick)
  // `disableFileHeader`: we render our own header (filename, status, +/-, reviewed
  // checkbox) above the diff body, so pierre's own file-header row would be redundant.
  // `themeType`: defaults to `'system'` (OS-level `prefers-color-scheme`) otherwise,
  // ignoring our own dark-mode toggle entirely - pin it to the app's actual state.
  instance = virtualizer
    ? new VirtualizedFileDiff(pierreOptions.value, virtualizer, undefined, undefined, true)
    : new PierreFileDiff(pierreOptions.value, undefined, true)

  instance.render({
    fileDiff: fileDiff.value,
    fileContainer: containerRef.value,
    lineAnnotations: lineAnnotations.value.map(annotation => ({ ...annotation })),
  })
}

onMounted(mount)
onBeforeUnmount(() => instance?.cleanUp())

watch(
  collapsed,
  () => mount(),
  { flush: 'post' },
)

watch(
  pierreOptions,
  (options) => {
    instance?.setOptions(options)
    instance?.rerender()
  },
)

watch(
  [fileDiff, containerRef] as const,
  ([fileDiff, containerRef]) => {
    if (!fileDiff || !containerRef) {
      return
    }
    instance?.render({
      fileDiff,
      fileContainer: containerRef,
      lineAnnotations: lineAnnotations.value.map(annotation => ({ ...annotation })),
    })
  },
)

// Plain clones, not the reactive proxies - pierre compares/caches these objects.
// `VirtualizedFileDiff.setLineAnnotations` only flags a forced render; nothing schedules
// it until the virtualizer next ticks (a scroll), so the new annotation slot - and the
// composer inside it - would stay missing. `rerender()` asks the virtualizer for that pass.
watch(lineAnnotations, (annotations) => {
  instance?.setLineAnnotations(annotations.map(annotation => ({ ...annotation })))
  instance?.rerender()
})

watch(isReviewed, (value) => {
  // Auto-collapse a file once it's marked reviewed (and re-expand it if unmarked) - it's
  // already handled, no need to keep it open. `collapsed`'s initial value above mirrors
  // this for a file that's already reviewed on first render.
  collapsed.value = value
})

defineExpose({
  /** Called by the file tree's "jump to file" navigation, which can't reach `collapsed` otherwise. */
  expand: () => { collapsed.value = false },
})
</script>

<template>
  <header
    :id="`file-${file.sha}`"
    class="relative sticky top-[calc(var(--diffs-header-height)-1px)] z-file-diff-header mt-2 flex items-center justify-between gap-2 overflow-hidden border border-base bg-base px-2 py-1.5"
    role="button"
    :class="collapsed ? 'rounded-lg' : 'rounded-t-lg'"
    @click.self="collapsed = !collapsed"
  >
    <div class="min-w-0 flex items-center gap-2 text-sm">
      <ReviewCheckbox
        :status="status"
        :aria-label="$t('file.markReviewed')"
        @update="store.setReviewed([file.sha], $event)"
      />
      <DisplayFilePath :path="file.path" class="min-w-0" />
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <span v-if="resolvedCount" class="text-xs op-fade">{{ $t('file.resolved', { n: resolvedCount }) }}</span>
      <DiffStats v-if="!file.isBinary" :additions="file.additions" :deletions="file.deletions" />
      <span v-else class="text-xs op-fade">{{ $t('file.binary') }}</span>
      <FileStatus :status="file.status" />
      <span v-if="fullFileError" class="text-xs text-red-500" :title="fullFileError.message">{{ $t('file.loadFailed') }}</span>
      <ActionIconButton
        v-if="canLoadFullFile || isLoadingFullFile"
        compact
        :icon="isLoadingFullFile ? 'i-ph:spinner-duotone animate-spin' : 'i-ph:file-text-duotone'"
        :disabled="isLoadingFullFile"
        :label="$t('file.loadFull')"
        :tooltip="$t('file.loadFull')"
        @click="loadFullFile"
      />
      <ActionIconButton
        compact
        :icon="collapsed ? 'i-ph:caret-right' : 'i-ph:caret-down'"
        :label="$t(collapsed ? 'file.expand' : 'file.collapse')"
        @click="collapsed = !collapsed"
      />
    </div>
  </header>
  <div v-if="!collapsed" class="overflow-hidden border-x border-b border-base rounded-b-xl">
    <div v-if="status === 'changed'" class="flex flex-wrap items-center justify-between gap-2 border-b border-orange:20 bg-orange:10 px-3 py-1.5 text-sm text-orange-700 dark:text-orange-400">
      <span class="flex items-center gap-1.5">
        <span class="i-ph:warning-circle-duotone shrink-0" aria-hidden="true" />
        {{ $t('file.changedSinceReviewed') }}
      </span>
      <ActionButton size="sm" @click="store.setReviewed([file.sha], true)">
        {{ $t('file.markReviewed') }}
      </ActionButton>
    </div>
    <div v-if="file.isBinary" class="p-4 text-sm op-fade">
      {{ $t('file.binaryNotShown') }}
    </div>
    <div v-else ref="container" :class="status === 'changed' ? 'mb--2' : 'my--2'">
      <!--
        Light-DOM children projected into pierre's shadow-DOM annotation rows via
        named slots (`annotation-<side>-<line>`), mirroring the library's own
        wrapper shape (`data-annotation-slot`, whitespace reset - the slot sits
        inside a `<pre>`). Keeps the thread UI fully Vue-reactive; pierre only
        needs the matching `lineAnnotations` entries to emit the slots.
      -->
      <!-- eslint-disable vue/no-deprecated-slot-attribute - a native shadow-DOM slot target, not Vue 2 slot syntax -->
      <div
        v-for="group in annotationGroups"
        :key="`${group.side}-${group.line}`"
        :slot="`annotation-${group.side}-${group.line}`"
        data-annotation-slot
        class="whitespace-normal px-2 text-left font-sans"
      >
        <ReviewThreadCard
          v-for="thread in group.threads"
          :key="thread.rootId"
          :thread="thread"
          :reviews="store.reviews!"
        />
        <div v-if="group.hasDraft" class="my-1 max-w-200 overflow-hidden border border-base rounded-lg bg-base">
          <CommentComposer
            :has-pending-review="!!store.reviews!.pendingReview"
            :busy="draftBusy"
            :error="draftError"
            @submit="submitDraft"
            @cancel="draftTarget = undefined"
          />
        </div>
      </div>
    <!-- eslint-enable vue/no-deprecated-slot-attribute -->
    </div>
  </div>
</template>
