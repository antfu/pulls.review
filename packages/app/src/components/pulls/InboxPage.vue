<script setup lang="ts">
import type { PrAnalysisStatus } from '../../analyze/remote-analyze'
import type { InboxSection, InboxStore } from '../../stores/inbox-store'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import { computed, ref, watch } from 'vue'
import { fetchAnalysisStatuses, prStatusKey } from '../../analyze/remote-analyze'
import { signInWithGithub } from '../../auth/github-oauth'
import { INBOX_SECTIONS } from '../../stores/inbox-store'
import NavControls from '../NavControls.vue'
import PullRequestRow from './PullRequestRow.vue'

const props = defineProps<{
  store: InboxStore
}>()

const SECTION_LABEL: Record<InboxSection, string> = {
  'needs-review': 'inbox.needsReview',
  'assigned': 'inbox.assigned',
  'authored': 'inbox.authored',
  'mentioned': 'inbox.mentioned',
}

const grouped = computed(() => INBOX_SECTIONS
  .map(section => ({ section, items: props.store.items.filter(item => item.section === section) }))
  .filter(group => group.items.length > 0))

// Decorate inbox rows with server-analysis status in 100-PR chunks.
const statuses = ref(new Map<string, PrAnalysisStatus>())
watch(() => props.store.items, async (items) => {
  if (items.length === 0)
    return
  const next = new Map<string, PrAnalysisStatus>()
  for (let start = 0; start < items.length; start += 100) {
    const chunk = items.slice(start, start + 100).map(item => ({ owner: item.owner, repo: item.repo, number: item.number }))
    const fetched = await fetchAnalysisStatuses(chunk).catch(() => new Map<string, PrAnalysisStatus>())
    for (const [key, value] of fetched)
      next.set(key, value)
  }
  statuses.value = next
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-base color-base">
    <header class="sticky left-0 right-0 top-0 z-nav border-b border-base bg-base px4 py2">
      <div class="mxa max-w-6xl w-full flex items-center gap-2">
        <RouterLink to="/" class="flex">
          <span class="i-ph-house-line-duotone text-lg color-accent-teal" aria-hidden="true" />
        </RouterLink>
        <h1 class="flex flex-auto items-center gap-1.5 text-lg font-semibold">
          {{ $t('inbox.title') }}
        </h1>
        <NavControls />
      </div>
    </header>

    <main class="mxa max-w-6xl w-full flex flex-1 flex-col px-4 py-4">
      <FeedbackLoading v-if="store.isLoading" :text="$t('pulls.loading')" class="py-12" />

      <FeedbackEmptyState v-else-if="store.needsSignIn" icon="i-ph:tray-duotone" :title="$t('inbox.title')">
        <template #hint>
          {{ $t('inbox.signIn') }}
        </template>
        <template #actions>
          <ActionButton variant="primary" icon="i-simple-icons-github" @click="signInWithGithub()">
            {{ $t('settings.token.signIn') }}
          </ActionButton>
        </template>
      </FeedbackEmptyState>

      <FeedbackEmptyState v-else-if="store.error" icon="i-ph:warning-duotone" :title="$t('inbox.loadFailed')">
        <template #hint>
          {{ store.error.message }}
        </template>
        <template #actions>
          <ActionButton variant="primary" @click="store.load()">
            {{ $t('common.retry') }}
          </ActionButton>
        </template>
      </FeedbackEmptyState>

      <FeedbackEmptyState v-else-if="store.items.length === 0" icon="i-ph:tray-duotone" :title="$t('inbox.empty')" />

      <div v-else class="flex flex-col gap-6">
        <section v-for="group in grouped" :key="group.section">
          <h2 class="mb-2 text-sm font-600 op80">
            {{ $t(SECTION_LABEL[group.section]) }}
            <span class="font-normal op60">{{ group.items.length }}</span>
          </h2>
          <div class="overflow-hidden border border-base rounded-lg">
            <PullRequestRow
              v-for="item in group.items"
              :key="`${item.owner}/${item.repo}#${item.number}`"
              :owner="item.owner"
              :repo="item.repo"
              :pr="item"
              :analysis-status="statuses.get(prStatusKey(item.owner, item.repo, item.number))"
            />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
