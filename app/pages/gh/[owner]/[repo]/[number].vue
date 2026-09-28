<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import DiffsPage from '../../../../components/diff/DiffsPage.vue'
import { settings } from '../../../../state/settings'
import { createDiffsStore } from '../../../../stores/diffs-store'

const route = useRoute()

const params = computed(() => ({
  kind: 'github-pr' as const,
  owner: route.params.owner as string,
  repo: route.params.repo as string,
  number: route.params.number as string,
}))

// `?from=<login>` deep-links a shared analysis (see plans/07); read once, never rewritten.
const from = typeof route.query.from === 'string' ? route.query.from : undefined

const store = createDiffsStore(params.value, { token: settings.value.githubToken, from })

onMounted(() => store.load())
</script>

<template>
  <main>
    <DiffsPage
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
              Retry
            </ActionButton>
          </template>
        </FeedbackEmptyState>
      </template>
    </DiffsPage>
  </main>
</template>
