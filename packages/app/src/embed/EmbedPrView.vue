<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { onMounted } from 'vue'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { resolveStoredTokenMeta } from '../composables/useGithubTokenMeta'
import { createDiffsStore } from '../stores/diffs-store'

// Mirrors `pages-web/diff.vue`'s wiring, from plain props instead of
// route params - there's no router here. `EmbedApp.ce.vue` gives this a `:key` per PR,
// so a fresh instance (and fresh store) is created per navigation, same as the routed
// page getting a fresh mount per route change. The store's `llm` is `undefined` here:
// the embed build compiles LLM support out (`PR_LLM: false`, see vite.config.embed.ts).
// Embedded-only UI keys off the compile-time `import.meta.env.PR_EMBED` flag directly.
const props = defineProps<{
  document?: Document | ShadowRoot
  owner: string
  repo: string
  number: string
}>()

const { cache, credentials } = useAppContext()
const store = createDiffsStore(createGithubPullRequestSource(props, credentials, { tokenMeta: resolveStoredTokenMeta }), { cache })

// The drawer reads shared-analysis state off it (dot on the toggles, `?from=` links).
defineExpose({ store })

onMounted(() => store.load())
</script>

<template>
  <DiffsPage
    :document
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
</template>
