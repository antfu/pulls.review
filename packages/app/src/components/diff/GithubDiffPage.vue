<script setup lang="ts">
import type { RoutableRef } from '../../source-routes'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { createGithubSource } from '@pulls.review/core/github'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../../app-context'
import DiffsPage from '../../components/diff/DiffsPage.vue'
import { useCommitView } from '../../composables/useCommitView'
import { useDocumentTitle } from '../../composables/useDocumentTitle'
import { resolveStoredTokenMeta } from '../../composables/useGithubTokenMeta'
import { createDiffsStore } from '../../stores/diffs-store'

const props = defineProps<{ sourceRef: RoutableRef }>()

const route = useRoute()
const { cache, credentials, llm } = useAppContext()

// Read once: `App.vue` keys the routed page by path, so another diff mounts a fresh page and store.
const ref = props.sourceRef

// `?from=<login>` deep-links a shared analysis (see plans/07); read once, never rewritten.
const from = Array.isArray(route.query.from) && route.query.from.length === 1 ? route.query.from[0] ?? undefined : undefined

const parent = createDiffsStore(createGithubSource(ref, credentials, { tokenMeta: resolveStoredTokenMeta }), { cache, llm, from })
const { store, commitNav, selected } = useCommitView(
  parent,
  sha => createGithubSource({ kind: 'github-commit', owner: ref.owner, repo: ref.repo, sha }, credentials, { tokenMeta: resolveStoredTokenMeta }),
  { cache, llm },
)

// Matches the header's title and label; before the diff loads, the repo still
// identifies what is opening.
useDocumentTitle(() => {
  const diff = store.value.diff
  if (!diff)
    return `${ref.owner}/${ref.repo}`
  return diff.label ? `${diff.title} (${diff.label})` : diff.title
})

onMounted(() => parent.load())
</script>

<template>
  <main>
    <!-- Keyed by commit: another diff starts with fresh collapse state and virtualizer. -->
    <DiffsPage
      :key="selected ?? ''"
      :store="store"
      :commit-nav="commitNav"
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
