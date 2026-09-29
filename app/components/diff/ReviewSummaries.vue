<script setup lang="ts">
import type { ReviewSummary } from '../../types/comment-threads'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import { Markdown } from '@comark/vue'
import { ref } from 'vue'
import GithubAvatar from '../GithubAvatar.vue'

defineProps<{
  summaries: ReviewSummary[]
}>()

const open = ref(false)

const STATE_DISPLAY = {
  approved: { label: 'approved', icon: 'i-ph:check-circle-duotone text-green-600 dark:text-green-400' },
  changes_requested: { label: 'requested changes', icon: 'i-ph:x-circle-duotone text-red-600 dark:text-red-400' },
  commented: { label: 'commented', icon: 'i-ph:chat-circle-dots-duotone op-fade' },
  dismissed: { label: 'review dismissed', icon: 'i-ph:prohibit op-mute' },
} as const
</script>

<template>
  <section v-if="summaries.length" class="border border-base rounded-lg">
    <button
      type="button"
      class="text-sm px-3 py-2 flex gap-1.5 w-full items-center"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span :class="open ? 'i-ph:caret-down' : 'i-ph:caret-right'" aria-hidden="true" />
      <span class="font-medium">Reviews</span>
      <span class="font-mono op-mute">{{ summaries.length }}</span>
    </button>
    <ul v-if="open" class="border-t border-base divide-#9992 divide-y">
      <li v-for="summary in summaries" :key="summary.id" class="text-sm px-3 py-2 flex flex-col gap-1">
        <div class="flex gap-2 items-center">
          <span :class="STATE_DISPLAY[summary.state].icon" aria-hidden="true" />
          <GithubAvatar v-if="summary.author" :login="summary.author.login" :avatar-url="summary.author.avatarUrl" :size="16" />
          <span class="font-medium">{{ summary.author?.login ?? 'ghost' }}</span>
          <span class="op-fade">{{ STATE_DISPLAY[summary.state].label }}</span>
          <DisplayDate v-if="summary.submittedAt" :date="summary.submittedAt" class="text-xs op-fade" />
        </div>
        <Suspense v-if="summary.body">
          <Markdown :value="summary.body" class="text-sm pl-6 op-fade" />
        </Suspense>
      </li>
    </ul>
  </section>
</template>
