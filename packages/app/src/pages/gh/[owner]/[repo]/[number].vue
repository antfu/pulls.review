<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppContext } from '../../../../app-context'
import DiffsPage from '../../../../components/diff/DiffsPage.vue'
import { useDocumentTitle } from '../../../../composables/useDocumentTitle'
import { resolveStoredTokenMeta } from '../../../../composables/useGithubTokenMeta'
import { createDiffsStore } from '../../../../stores/diffs-store'

const route = useRoute()
const { cache, credentials } = useAppContext()

// Read once: `App.vue` keys the routed page by path, so another PR mounts a fresh page and store.
const pr = {
  owner: route.params.owner as string,
  repo: route.params.repo as string,
  number: route.params.number as string,
}

// `?from=<login>` deep-links a shared analysis (see plans/07); read once, never rewritten.
const from = typeof route.query.from === 'string' ? route.query.from : undefined

const store = createDiffsStore(createGithubPullRequestSource(pr, credentials, { tokenMeta: resolveStoredTokenMeta }), { cache, from })

// The PR title matches the header's `{{ meta.title }} #number`; before it loads, fall
// back to the route so the tab still identifies which PR is opening.
useDocumentTitle(() => store.diff
  ? `${store.diff.title} (#${pr.number})`
  : `${pr.owner}/${pr.repo} #${pr.number}`)

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
