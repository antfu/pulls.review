<script setup lang="ts">
import type { PullRequestListStore } from '../../stores/pull-request-list-store'
import type { PullRequestSort } from './pull-request-list-query'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import GithubTokenRecovery from '../settings/GithubTokenRecovery.vue'
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

const hasItems = computed(() => props.store.items.length > 0)
const matchCount = computed(() => filterPullRequests(props.store.items, query.value).length)
const isSearching = computed(() => query.value.trim() !== '' && props.store.hasMore)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-base color-base">
    <PullsHeader v-model:query="query" v-model:sort="sort" :store="store" :scroll-y="scrollY" />

    <main class="mxa max-w-6xl w-full flex flex-1 flex-col">
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
          <GithubTokenRecovery class="mxa max-w-200 border border-base border-rounded p4" @saved="store.load()" />
        </div>
      </template>

      <template v-else>
        <div v-if="hasItems" class="overflow-hidden border border-base rounded-lg">
          <!-- The last row's bottom border hides under the container's own. -->
          <PullRequestList :store="store" :query="query" :sort="sort" class="-mb-px" />
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
