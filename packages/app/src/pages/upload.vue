<script setup lang="ts">
import type { DiffsStore } from '../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { UPLOAD_SESSION_STORAGE_KEY } from '../composables/uploadSession'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { createDiffsStore } from '../stores/diffs-store'

const router = useRouter()
const { storage } = useAppContext()
const hasPending = ref(false)

const pending = (() => {
  const raw = sessionStorage.getItem(UPLOAD_SESSION_STORAGE_KEY)
  if (!raw)
    return undefined
  return JSON.parse(raw) as { text: string, title?: string }
})()

// No store at all when there's no pending upload - `DiffsPage`'s `store` prop is
// optional exactly for this case, so the empty-state slot renders around nothing
// rather than a store wrapping empty text.
const store: DiffsStore | undefined = pending
  ? createDiffsStore({ kind: 'patch-text', text: pending.text, title: pending.title }, { storage })
  : undefined

useDocumentTitle(() => store?.diff?.title)

async function loadAll() {
  if (!store) {
    hasPending.value = false
    return
  }
  hasPending.value = true
  await store.load()
}

onMounted(loadAll)
</script>

<template>
  <main>
    <DiffsPage
      :store="store"
    >
      <template #loading>
        <FeedbackLoading :text="$t('load.parsing')" />
      </template>
      <template #error="{ error: err }">
        <FeedbackEmptyState
          icon="i-ph:warning-duotone"
          :title="$t('load.parseFailed')"
        >
          <template #hint>
            {{ err.message }}
          </template>
        </FeedbackEmptyState>
      </template>
      <template #empty>
        <FeedbackEmptyState
          icon="i-ph:upload-simple-duotone"
          :title="$t('load.noDiff')"
        >
          <template #hint>
            {{ $t('load.noDiffHint') }}
          </template>
          <template #actions>
            <ActionButton variant="primary" @click="router.push('/')">
              {{ $t('load.goHome') }}
            </ActionButton>
          </template>
        </FeedbackEmptyState>
      </template>
    </DiffsPage>
  </main>
</template>
