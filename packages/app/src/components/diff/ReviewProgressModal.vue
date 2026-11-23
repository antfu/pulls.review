<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import { fileReviewKey } from '@pulls.review/core/types'
import { computed } from 'vue'
import { scrollToFile } from '../../composables/scrollToFile'
import AppModal from '../AppModal.vue'
import { reviewStatus } from './review-status'
import ReviewCheckbox from './ReviewCheckbox.vue'

const props = defineProps<{
  open: boolean
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const rows = computed(() => (props.store.diff?.files ?? [])
  .map(file => ({ file, status: reviewStatus(props.store, file) }))
  .sort((a, b) => a.file.path.localeCompare(b.file.path)))

const reviewedCount = computed(() => rows.value.filter(row => row.status === 'reviewed').length)

function keysWhere(reviewed: boolean) {
  return rows.value.filter(row => (row.status === 'reviewed') === reviewed).map(row => fileReviewKey(row.file))
}

async function invert() {
  const [toUnmark, toMark] = [keysWhere(true), keysWhere(false)]
  await props.store.setReviewed(toUnmark, false)
  await props.store.setReviewed(toMark, true)
}

// The file header is always rendered (even collapsed), so plain scroll-into-view
// is enough - unlike the tree's navigate, which also expands the body.
function jumpTo(sha: string) {
  const root = props.document ?? document
  emit('update:open', false)
  scrollToFile(root, sha)
}
</script>

<template>
  <AppModal
    :title="$t('reviewProgress.title')"
    :description="$t('group.filesReviewed', { reviewed: reviewedCount, total: rows.length })"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <ActionButton size="sm" icon="i-ph:checks" :disabled="reviewedCount === rows.length" @click="store.setReviewed(keysWhere(false), true)">
          {{ $t('reviewProgress.markAll') }}
        </ActionButton>
        <ActionButton size="sm" icon="i-ph:arrows-left-right" :disabled="rows.length === 0" @click="invert">
          {{ $t('reviewProgress.invert') }}
        </ActionButton>
        <ActionButton size="sm" icon="i-ph:arrow-counter-clockwise" :disabled="reviewedCount === 0 && store.changedSinceReviewed.size === 0" @click="store.setReviewed(rows.map(row => fileReviewKey(row.file)), false)">
          {{ $t('reviewProgress.reset') }}
        </ActionButton>
      </div>
      <ul class="flex flex-col text-sm">
        <li v-for="{ file, status } in rows" :key="file.sha" class="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
          <ReviewCheckbox
            :status="status"
            :aria-label="$t('file.markReviewed')"
            @update="store.setReviewed([fileReviewKey(file)], $event)"
          />
          <button type="button" class="min-w-0 flex-1 text-left" @click="jumpTo(file.sha)">
            <DisplayFilePath :path="file.path" class="min-w-0" />
          </button>
          <span
            class="shrink-0 text-xs"
            :class="status === 'changed' ? 'text-orange-700 dark:text-orange-400' : status === 'reviewed' ? 'text-primary-600 dark:text-primary-400' : 'op-fade'"
          >
            {{ $t(`reviewProgress.status.${status}`) }}
          </span>
        </li>
      </ul>
    </div>
  </AppModal>
</template>
