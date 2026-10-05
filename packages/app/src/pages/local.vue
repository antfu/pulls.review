<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { inject, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { localRpcKey } from '../local/local-rpc-key'
import { createRpcSource } from '../local/rpc-backends'
import { createDiffsStore } from '../stores/diffs-store'

// Only `installLocal` registers this page, after providing the RPC client.
const rpc = inject(localRpcKey)!
const route = useRoute()
const { cache } = useAppContext()

// Read once: another target is another path, which remounts the page.
const target = String(route.params.target ?? '')
const store = createDiffsStore(createRpcSource(rpc, target), { cache })

useDocumentTitle(() => store.diff?.title ?? target)

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
