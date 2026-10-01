<script setup lang="ts">
import type { ReviewSummary } from '@pulls.review/core'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import { Markdown } from '@comark/vue'
import { ref } from 'vue'
import GithubAvatar from '../GithubAvatar.vue'

defineProps<{
  summaries: ReviewSummary[]
}>()

const open = ref(false)

const STATE_DISPLAY = {
  approved: { label: 'review.approved', icon: 'i-ph:check-circle-duotone text-green-600 dark:text-green-400' },
  changes_requested: { label: 'review.changesRequested', icon: 'i-ph:x-circle-duotone text-red-600 dark:text-red-400' },
  commented: { label: 'review.commented', icon: 'i-ph:chat-circle-dots-duotone op-fade' },
  dismissed: { label: 'review.dismissed', icon: 'i-ph:prohibit op-mute' },
} as const
</script>

<template>
  <section v-if="summaries.length" class="border border-base rounded-lg">
    <button
      type="button"
      class="w-full flex items-center gap-1.5 px-3 py-2 text-sm"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span :class="open ? 'i-ph:caret-down' : 'i-ph:caret-right'" aria-hidden="true" />
      <span class="font-medium">{{ $t('review.reviews') }}</span>
      <span class="font-mono op-mute">{{ summaries.length }}</span>
    </button>
    <ul v-if="open" class="border-t border-base divide-y divide-#9992">
      <li v-for="summary in summaries" :key="summary.id" class="flex flex-col gap-1 px-3 py-2 text-sm">
        <div class="flex items-center gap-2">
          <span :class="STATE_DISPLAY[summary.state].icon" aria-hidden="true" />
          <GithubAvatar v-if="summary.author" :login="summary.author.login" :avatar-url="summary.author.avatarUrl" :size="16" />
          <span class="font-medium">{{ summary.author?.login ?? 'ghost' }}</span>
          <span class="op-fade">{{ $t(STATE_DISPLAY[summary.state].label) }}</span>
          <DisplayDate v-if="summary.submittedAt" :date="summary.submittedAt" class="text-xs op-fade" />
        </div>
        <Suspense v-if="summary.body">
          <Markdown :value="summary.body" class="pl-6 text-sm op-fade" />
        </Suspense>
      </li>
    </ul>
  </section>
</template>
