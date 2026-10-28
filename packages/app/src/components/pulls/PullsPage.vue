<script setup lang="ts">
import type { PrAnalysisStatus } from '../../analyze/remote-analyze'
import type { PullRequestListStore } from '../../stores/pull-request-list-store'
import type { PullRequestSort } from './pull-request-list-query'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { fetchAnalysisStatuses, prStatusKey } from '../../analyze/remote-analyze'
import { isGithubOauthAvailable } from '../../auth/github-oauth'
import GithubAuthRecovery from '../settings/GithubAuthRecovery.vue'
import AutomationOpsPanel from './AutomationOpsPanel.vue'
import { filterPullRequests } from './pull-request-list-query'
import PullRequestList from './PullRequestList.vue'
import PullsHeader from './PullsHeader.vue'

const props = defineProps<{
  store: PullRequestListStore
}>()

const query = ref('')
// Matches the order pages arrive in, so an unfinished load never looks mis-sorted.
const sort = ref<PullRequestSort>('recently-updated')

// A client-side search is only trustworthy over the full set: typing drains the
// remaining pages (the list keeps rendering matches as they arrive).
watch(query, (value) => {
  if (value.trim())
    props.store.loadAll()
})

const scrollY = ref(0)
useEventListener(document, 'scroll', () => {
  scrollY.value = window.scrollY
}, { capture: true })

// Server-analysis decoration for loaded rows (hosted app only, best-effort).
const analysisStatuses = ref(new Map<number, PrAnalysisStatus>())
watch(() => props.store.items.map(item => item.number).join(','), async () => {
  if (!isGithubOauthAvailable())
    return
  const missing = props.store.items.filter(item => !analysisStatuses.value.has(item.number))
  if (missing.length === 0)
    return
  const fetched = await fetchAnalysisStatuses(missing.map(item => ({ owner: props.store.owner, repo: props.store.repo, number: item.number }))).catch(() => new Map())
  if (fetched.size === 0)
    return
  const next = new Map(analysisStatuses.value)
  for (const item of missing) {
    const status = fetched.get(prStatusKey(props.store.owner, props.store.repo, item.number))
    if (status)
      next.set(item.number, status)
  }
  analysisStatuses.value = next
})

const hasItems = computed(() => props.store.items.length > 0)
const matchCount = computed(() => filterPullRequests(props.store.items, query.value).length)
const isSearching = computed(() => query.value.trim() !== '' && props.store.hasMore)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-base color-base">
    <PullsHeader v-model:query="query" v-model:sort="sort" :store="store" :scroll-y="scrollY" />

    <main class="mxa max-w-6xl w-full flex flex-1 flex-col">
      <AutomationOpsPanel :owner="store.owner" :repo="store.repo" class="mt-4" />
      <template v-if="store.isLoading">
        <div class="px-4 py-12">
          <FeedbackLoading :text="$t('pulls.loading')" />
        </div>
      </template>

      <template v-else-if="store.error && !hasItems">
        <div class="flex flex-col gap-8 px-4 py-12">
          <FeedbackEmptyState icon="i-ph:warning-duotone" :title="$t('pulls.loadFailed')">
            <template #hint>
              {{ store.error.message }}
            </template>
            <template #actions>
              <ActionButton variant="primary" @click="store.load()">
                {{ $t('common.retry') }}
              </ActionButton>
            </template>
          </FeedbackEmptyState>
          <GithubAuthRecovery class="mxa max-w-200 border border-base border-rounded p4" />
        </div>
      </template>

      <template v-else>
        <div v-if="hasItems" class="overflow-hidden border border-base rounded-lg">
          <!-- The last row's bottom border hides under the container's own. -->
          <PullRequestList :store="store" :query="query" :sort="sort" :statuses="analysisStatuses" class="-mb-px" />
          <div v-if="matchCount === 0 && !isSearching" class="px-4 py-12">
            <FeedbackEmptyState icon="i-ph:magnifying-glass-duotone" :title="$t('pulls.noMatches')" />
          </div>
        </div>
        <div v-else class="px-4 py-12">
          <FeedbackEmptyState icon="i-ph:git-pull-request-duotone" :title="$t('pulls.empty')" />
        </div>

        <div class="flex flex-col items-center gap-2 px-4 py-4 text-sm op-fade">
          <FeedbackLoading v-if="isSearching" :text="$t('pulls.searchingAll', { n: store.totalCount ?? 0 })" />
          <FeedbackLoading v-else-if="store.isLoadingMore" :text="$t('pulls.loadingMore')" />
          <template v-else-if="store.error">
            <span class="color-error-500">{{ store.error.message }}</span>
            <ActionButton size="sm" @click="store.hasMore ? store.loadMore() : store.refresh()">
              {{ $t('common.retry') }}
            </ActionButton>
          </template>
        </div>
      </template>
    </main>
  </div>
</template>
