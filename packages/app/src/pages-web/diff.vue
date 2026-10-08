<script setup lang="ts">
import type { RoutableRef } from '../source-routes'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { parentForRef } from '../source-routes'
import { createSourceForRef } from '../sources'
import { createDiffsStore } from '../stores/diffs-store'

const props = defineProps<{ sourceRef: RoutableRef }>()

const route = useRoute()
const { cache, credentials, llm } = useAppContext()

// Read once: `App.vue` keys the routed page by path, so another diff mounts a fresh page and store.
const ref = props.sourceRef

// `?from=<login>` deep-links a shared analysis (see plans/07); read once, never rewritten.
const from = typeof route.query.from === 'string' ? route.query.from : undefined

const store = createDiffsStore(createSourceForRef(ref, credentials), { cache, llm, from })

// Matches the header's title and label; before the diff loads, the repo still
// identifies what is opening.
useDocumentTitle(() => {
  const diff = store.diff
  if (!diff)
    return parentForRef(ref)?.label ?? ''
  return diff.label ? `${diff.title} (${diff.label})` : diff.title
})

onMounted(() => store.load())
</script>

<template>
  <main>
    <DiffsPage
      :store="store"
    >
      <template #loading>
        <FeedbackLoading :text="$t('pr.loading')" />
      </template>
      <template #error="{ error: err, retry }">
        <FeedbackEmptyState
          icon="i-ph:warning-duotone"
          :title="$t('pr.loadFailed')"
        >
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
