<script setup lang="ts">
import type { LocalPage } from '../../local/pages'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { inject, onMounted } from 'vue'
import { useAppContext } from '../../app-context'
import { useCommitView } from '../../composables/useCommitView'
import { useDocumentTitle } from '../../composables/useDocumentTitle'
import { localRpcKey } from '../../local/local-rpc-key'
import { routeForPage, targetFor } from '../../local/pages'
import { createRpcSource } from '../../local/rpc-backends'
import { createDiffsStore } from '../../stores/diffs-store'
import DiffsPage from './DiffsPage.vue'

const props = defineProps<{ page: LocalPage }>()

// Local startup provides the RPC client before the router installs.
const rpc = inject(localRpcKey)!
const { cache, llm } = useAppContext()

// Read once: another page is another path, which remounts this one.
const parent = createDiffsStore(createRpcSource(rpc, targetFor(props.page, rpc)), { cache, llm })
const { store, commitNav, selected } = useCommitView(parent, sha => createRpcSource(rpc, Promise.resolve(sha)), { cache, llm })

useDocumentTitle(() => store.value.diff?.title ?? routeForPage(props.page))

onMounted(() => parent.load())
</script>

<template>
  <main>
    <!-- Keyed by commit: another diff starts with fresh collapse state and virtualizer. -->
    <DiffsPage :key="selected ?? ''" :store="store" :commit-nav="commitNav">
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
