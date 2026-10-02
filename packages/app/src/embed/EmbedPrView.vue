<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { computed, onMounted } from 'vue'
import { useAppContext } from '../app-context'
import DiffsPage from '../components/diff/DiffsPage.vue'
import { settings } from '../state/settings'
import { createDiffsStore } from '../stores/diffs-store'

// Mirrors `pages/gh/[owner]/[repo]/[number].vue`'s wiring, from plain props instead of
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

const params = computed(() => ({
  kind: 'github-pr' as const,
  owner: props.owner,
  repo: props.repo,
  number: props.number,
}))

const store = createDiffsStore(params.value, { storage: useAppContext().storage, token: settings.value.githubToken })

onMounted(() => store.load())
</script>

<template>
  <DiffsPage
    :document
    :store="store"
  >
    <template #loading>
      <FeedbackLoading text="Loading pull request…" />
    </template>
    <template #error="{ error: err, retry }">
      <FeedbackEmptyState
        icon="i-ph:warning-duotone"
        title="Couldn't load this pull request"
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
