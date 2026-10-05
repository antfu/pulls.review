<script setup lang="ts">
import type { LocalPage } from '../local/pages'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { inject, onMounted } from 'vue'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { localRpcKey } from '../local/local-rpc-key'
import { routeForPage, targetFor } from '../local/pages'
import { createRpcSource } from '../local/rpc-backends'
import { createDiffsStore } from '../stores/diffs-store'

const props = defineProps<{ page: LocalPage }>()

// Only `installLocal` registers this page, after providing the RPC client.
const rpc = inject(localRpcKey)!
const { cache } = useAppContext()

// Read once: another page is another path, which remounts this one.
const store = createDiffsStore(createRpcSource(rpc, targetFor(props.page, rpc)), { cache })

useDocumentTitle(() => store.diff?.title ?? routeForPage(props.page))

onMounted(() => store.load())
</script>

<template>
  <main>
    <DiffsPage :store="store">
      <template #loading>
        <FeedbackLoading :text="$t('local.loading')" />
      </template>
      <template #error="{ error: err, retry }">
        <FeedbackEmptyState icon="i-ph:warning-duotone" :title="$t('local.loadFailed')">
          <template #hint>
            {{ err.message }}
          </template>
          <template #actions>
            <ActionButton variant="primary" @click="retry">
              {{ $t('common.retry') }}
            </ActionButton>
          </template>
        </FeedbackEmptyState>
      </template>
    </DiffsPage>
  </main>
</template>
