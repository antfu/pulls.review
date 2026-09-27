<script setup lang="ts">
import type { FileDiffOptions } from '@pierre/diffs'
import type { DiffsStore } from '../../stores/types'
import type { FileChange } from '../../types/diff'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { FileDiff as PierreFileDiff, processFile, VirtualizedFileDiff } from '@pierre/diffs'
import { computed, inject, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { getCachedFileContent, setCachedFileContent } from '../../cache/file-content-cache'
import { getDefaultCacheStorage } from '../../cache/storage'
import { fetchFileContentAtRef } from '../../providers/github/api'
import { isDark as globalIsDark, isDarkKey } from '../../state/dark'
import { settings } from '../../state/settings'
import { diffVirtualizerKey } from './diff-virtualizer'
import DiffStats from './DiffStats.vue'
import { fileContentContextKey } from './file-content-context'
import FileStatus from './FileStatus.vue'
import { isNoisyFile } from './noisy-files'
import { ensurePierreDiffsShadowRoot } from './pierre-diffs-shadow'

const props = defineProps<{
  store: DiffsStore
  file: FileChange
}>()

const isReviewed = computed(() => props.store.reviewed.has(props.file.sha))

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
    })
  },
)

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
  <div :id="`file-${file.sha}`" class="border border-base rounded-lg overflow-hidden">
    <header
      class="z-[20] px-2 py-1.5 flex gap-2 items-center justify-between"
      role="button"
      @click.self="collapsed = !collapsed"
    >
      <div class="text-sm flex gap-2 min-w-0 items-center">
        <FormCheckbox
          :model-value="isReviewed"
          aria-label="Mark as reviewed"
          @update:model-value="store.toggleReviewed(file.sha, $event)"
        />
        <DisplayFilePath :path="file.path" class="min-w-0" />
      </div>
      <div class="flex shrink-0 gap-2 items-center">
        <DiffStats v-if="!file.isBinary" :additions="file.additions" :deletions="file.deletions" />
        <span v-else class="text-xs op-fade">Binary file</span>
        <FileStatus :status="file.status" />
        <span v-if="fullFileError" class="text-xs text-red-500" :title="fullFileError.message">Failed to load</span>
        <ActionIconButton
          v-if="canLoadFullFile || isLoadingFullFile"
          compact
          :icon="isLoadingFullFile ? 'i-ph:spinner-duotone animate-spin' : 'i-ph:file-text-duotone'"
          :disabled="isLoadingFullFile"
          label="Load full file content"
          tooltip="Load full file content"
          @click="loadFullFile"
        />
        <ActionIconButton
          compact
          :icon="collapsed ? 'i-ph:caret-right' : 'i-ph:caret-down'"
          :label="collapsed ? 'Expand file' : 'Collapse file'"
          @click="collapsed = !collapsed"
        />
      </div>
    </header>
    <div v-if="file.isBinary" class="text-sm p-4 op-fade">
      Binary file not shown.
    </div>
    <div v-else-if="!collapsed" ref="container" />
  </div>
</template>
