<script setup lang="ts">
import type { DiffLineAnnotation, FileDiffLoadedFiles, FileDiffOptions, SelectedLineRange } from '@pierre/diffs'
import type { CommentThread, DiffSide, FileChange, ReviewDraftTarget } from '@pulls.review/core/types'
import type { DiffsStore } from '../../stores/types'
import type { ResolvedNote } from './group-utils'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import { FileDiff as PierreFileDiff, VirtualizedFileDiff } from '@pierre/diffs'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { autoFetchFullFile } from '../../state/auto-fetch-full-file'
import { isDark as globalIsDark, isDarkKey } from '../../state/dark'
import { syntaxTheme } from '../../state/syntax-theme'
import { wrapLines } from '../../state/wrap-lines'
import AnalysisNoteCard from './AnalysisNoteCard.vue'
import CommentComposer from './CommentComposer.vue'
import CriticalMark from './CriticalMark.vue'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffStats from './DiffStats.vue'
import { fileCollapseKey } from './file-collapse'
import { buildFileDiff, needsFullFileToHighlight } from './file-diff-input'
import FileStatus from './FileStatus.vue'
import { fileIsCritical } from './group-utils'
import { isNoisyFile } from './noisy-files'
import { ensurePierreDiffsShadowRoot } from './pierre-diffs-shadow'
import { reviewStatus } from './review-status'
import ReviewCheckbox from './ReviewCheckbox.vue'
import ReviewThreadCard from './ReviewThreadCard.vue'

const props = defineProps<{
  store: DiffsStore
  file: FileChange
  /** Analysis notes resolved for this file (see `resolveGroups`). */
  notes?: ResolvedNote[]
}>()

const status = computed(() => reviewStatus(props.store, props.file))
const isReviewed = computed(() => status.value === 'reviewed')
const isCritical = computed(() => fileIsCritical(props.notes))
const fileNotes = computed(() => props.notes?.filter(note => !note.anchor) ?? [])

// Reads the embed's own scoped ref when provided (see `state/dark.ts`), otherwise the
// app-wide singleton - never targets `document.documentElement` from inside the embed.
const isDark = inject(isDarkKey, globalIsDark)
const virtualizer = inject(diffVirtualizerKey, undefined)

const containerRef = useTemplateRef<HTMLDivElement>('container')
// Standalone (stories) there's no `DiffsPage` providing it, so state stays local.
const collapseState = inject(fileCollapseKey, () => reactive(new Map<string, boolean>()), true)
const collapsed = computed({
  get: () => collapseState.get(props.file.sha) ?? (isReviewed.value || isNoisyFile(props.file.path)),
  set: value => collapseState.set(props.file.sha, value),
})
let instance: PierreFileDiff | undefined

// Full file content, fetched on demand through the store (see `loadFullFile`) -
// `undefined` means "not fetched" for a side that *could* exist, distinct from a side
// that structurally doesn't (an added file's old side, a removed file's new side).
const fullOldContent = ref<string>()
const fullNewContent = ref<string>()
const isLoadingFullFile = ref(false)
const fullFileError = ref<Error>()
const fullFileLoaded = computed(() => fullOldContent.value !== undefined || fullNewContent.value !== undefined)
const canLoadFullFile = computed(() => !!props.store.fileContent && !props.file.isBinary && !fullFileLoaded.value)

async function fetchFullFile() {
  const { fileContent } = props.store
  if (!fileContent || fullFileLoaded.value)
    return

  isLoadingFullFile.value = true
  fullFileError.value = undefined
  try {
    const content = await fileContent.load(props.file)
    fullOldContent.value = content.old
    fullNewContent.value = content.new
  }
  catch (err) {
    fullFileError.value = err instanceof Error ? err : new Error(String(err))
  }
  finally {
    isLoadingFullFile.value = false
  }
}

let fullFileLoad: Promise<void> | undefined
function loadFullFile() {
  return fullFileLoad ??= fetchFullFile().finally(() => {
    fullFileLoad = undefined
  })
}

// Pierre only renders the "N unmodified lines" expand controls on a bare patch when it has
// a loader for the full file, which it calls on the first click. The load goes through
// `loadFullFile` so the re-rendered complete diff, not pierre's own hydration, is what
// ends up on screen - the expansion pierre recorded for that click carries over to it.
async function loadDiffFiles(): Promise<FileDiffLoadedFiles> {
  await loadFullFile()
  if (fullFileError.value)
    throw fullFileError.value
  const oldContents = fullOldContent.value
  const newContents = fullNewContent.value
  if (oldContents === undefined || newContents === undefined)
    throw new Error(`Full contents unavailable for ${props.file.path}`)
  return {
    oldFile: { name: props.file.previousPath ?? props.file.path, contents: oldContents },
    newFile: { name: props.file.path, contents: newContents },
  }
}

const fileDiff = computed(() => {
  if (collapsed.value || props.file.isBinary)
    return
  return buildFileDiff(props.file, fullFileLoaded.value
    ? { old: fullOldContent.value, new: fullNewContent.value }
    : undefined)
})

// Loads the full file once the diff nears the viewport: a patch alone can't give correct
// highlighting (see `needsFullFileToHighlight`). Loads are cached per sha and path.
const nearViewport = ref(false)
const { stop: stopFullFilePreload } = useIntersectionObserver(containerRef, ([entry]) => {
  nearViewport.value = !!entry?.isIntersecting
}, { rootMargin: '600px 0px' })

watch([nearViewport, autoFetchFullFile], ([near, enabled]) => {
  if (!near || !enabled)
    return
  stopFullFilePreload()
  if (canLoadFullFile.value && needsFullFileToHighlight(props.file))
    loadFullFile()
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
  notes: ResolvedNote[]
  threads: CommentThread[]
  hasDraft: boolean
}

// One annotation (and one slotted wrapper) per anchor line: pierre emits one
// shadow-DOM `<slot>` per annotation, and duplicate slot names would swallow
// all but the first wrapper - so notes and threads sharing a line stack in one group.
const annotationGroups = computed<AnnotationGroup[]>(() => {
  const groups = new Map<string, AnnotationGroup>()
  function groupFor(side: DiffSide, line: number): AnnotationGroup {
    const key = `${side}-${line}`
    let group = groups.get(key)
    if (!group) {
      group = { side, line, notes: [], threads: [], hasDraft: false }
      groups.set(key, group)
    }
    return group
  }
  for (const note of props.notes ?? []) {
    if (note.anchor)
      groupFor(note.anchor.side, note.anchor.line).notes.push(note)
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
  overflow: wrapLines.value ? 'wrap' : 'scroll',
  // Plain clone, not the computed's object - pierre compares/caches it (see `lineAnnotations`).
  theme: { ...syntaxTheme.value },
  themeType: isDark.value ? 'dark' : 'light',
  disableErrorHandling: false,
  disableFileHeader: true,
  ...(props.store.fileContent ? { loadDiffFiles } : {}),
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

  ensurePierreDiffsShadowRoot(containerRef.value)
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
  // already handled, no need to keep it open. `collapsed`'s default above mirrors this
  // for a file the viewer hasn't toggled yet.
  collapsed.value = value
})

defineExpose({
  /** Called by the file tree's "jump to file" navigation, which can't reach `collapsed` otherwise. */
  expand: () => { collapsed.value = false },
})
</script>

<template>
  <div class="sticky top-[calc(var(--diffs-header-height)-1px)] z-file-diff-header mt-2 bg-base">
    <header
      :id="`file-${file.sha}`"
      class="relative flex items-center justify-between gap-2 overflow-hidden border border-base bg-base px-2 py-1.5"
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
        <CriticalMark v-if="isCritical" />
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
  </div>
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
    <div v-if="fileNotes.length" class="mb-2 flex flex-col border-b border-base">
      <AnalysisNoteCard v-for="(note, index) in fileNotes" :key="index" :note="note" :borderless="true" />
    </div>
    <div v-if="file.isBinary" class="p-4 text-sm op-fade">
      {{ $t('file.binaryNotShown') }}
    </div>
    <div v-else-if="file.truncated && !fullFileLoaded" class="p-4 text-sm op-fade">
      {{ $t('file.tooLarge') }}
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
        <AnalysisNoteCard v-for="(note, index) in group.notes" :key="index" :note="note" />
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
