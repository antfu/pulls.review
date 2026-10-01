<script setup lang="ts">
import type { ChecksStatus, PullRequestListItem, ReviewDecision } from '@pulls.review/core'
import type { ViewedPullRequest } from '../../stores/pull-request-list-store'
import { labelStyle } from '@antfu/design/utils/color'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTimeAgo } from '../../i18n/time-ago'
import { isDark } from '../../state/dark'
import DiffStats from '../diff/DiffStats.vue'
import PrStatusIcon from '../diff/PrStatusIcon.vue'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{
  owner: string
  repo: string
  pr: PullRequestListItem
  /** Set when this browser already viewed the PR - what the cache holds for it. */
  viewed?: ViewedPullRequest
}>()

const { locale } = useI18n()

const openedAgo = computed(() => formatTimeAgo(new Date(props.pr.createdAt), locale.value))
// The locally viewed diff is the one the reader will actually reopen; the API's
// counts only fill in when a token exposed them and nothing is cached.
const stats = computed(() => props.viewed ?? (props.pr.additions !== undefined ? { additions: props.pr.additions, deletions: props.pr.deletions } : undefined))

// GitHub-style contrast-aware chip colors from the label's own hex, tuned per scheme.
function labelChipStyle(color: string) {
  const { color: text, background, borderColor } = labelStyle(`#${color}`, isDark.value)
  return { color: text, background, borderColor }
}

// GitHub's own glyphs and colors for the CI rollup next to the title.
const CHECKS_ICON: Record<ChecksStatus, string> = {
  success: 'i-ph:check-bold text-green-600 dark:text-green-400',
  failure: 'i-ph:x-bold text-red-600 dark:text-red-400',
  pending: 'i-ph:circle-fill text-amber-500',
}

const REVIEW_ICON: Record<ReviewDecision, string> = {
  approved: 'i-ph:check-circle-duotone text-green-600 dark:text-green-400',
  changes_requested: 'i-ph:x-circle-duotone text-red-600 dark:text-red-400',
  review_required: 'i-ph:eye-duotone op-fade',
}
</script>

<template>
  <RouterLink
    :to="`/gh/${owner}/${repo}/${pr.number}`"
    class="flex items-start gap-3 border-b border-base px-4 py-3 transition hover:bg-hover"
  >
    <PrStatusIcon :state="pr.state" class="mt-0.5" />

    <div class="min-w-0 flex flex-1 flex-col gap-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="break-words font-medium leading-snug">{{ pr.title }}</span>
        <span
          v-if="pr.checks"
          :class="CHECKS_ICON[pr.checks]"
          class="shrink-0 text-xs"
          role="img"
          :aria-label="$t(`pulls.checks.${pr.checks}`)"
          :title="$t(`pulls.checks.${pr.checks}`)"
        />
        <span
          v-for="label in pr.labels"
          :key="label.name"
          class="inline-flex items-center border rounded-full px-2 py-0.5 text-xs font-medium leading-none"
          :style="labelChipStyle(label.color)"
          :title="label.description"
        >{{ label.name }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs op-fade">
        <span>#{{ pr.number }}</span>
        <i18n-t keypath="pulls.openedBy" tag="span" scope="global">
          <template #time>
            <time :datetime="pr.createdAt" :title="new Date(pr.createdAt).toLocaleString(locale)">{{ openedAgo }}</time>
          </template>
          <template #author>
            <span class="inline-flex items-center gap-1 align-bottom font-medium">
              <GithubAvatar v-if="pr.author" :login="pr.author.login" :avatar-url="pr.author.avatarUrl" :size="14" />
              {{ pr.author?.login ?? 'ghost' }}
            </span>
          </template>
        </i18n-t>
        <template v-if="pr.milestone">
          <span aria-hidden="true">·</span>
          <span class="flex items-center gap-1" :title="$t('pulls.milestone')">
            <span class="i-ph:flag-duotone" aria-hidden="true" />
            {{ pr.milestone }}
          </span>
        </template>
        <template v-if="pr.reviewDecision">
          <span aria-hidden="true">·</span>
          <span class="flex items-center gap-1">
            <span :class="REVIEW_ICON[pr.reviewDecision]" aria-hidden="true" />
            {{ $t(`pulls.review.${pr.reviewDecision}`) }}
          </span>
        </template>
      </div>
    </div>

    <div class="flex shrink-0 flex-col items-end gap-2 pt-0.5 text-xs">
      <DiffStats v-if="stats" :additions="stats.additions" :deletions="stats.deletions" />
      <div class="flex items-center gap-2 op-fade">
        <span
          v-if="viewed"
          class="flex items-center gap-1"
          :title="$t('pulls.viewedHint')"
        >
          <span
            v-if="viewed.hasAiResult"
            class="i-ph:sparkle-duotone color-accent-teal"
            role="img"
            :aria-label="$t('pulls.aiAvailable')"
            :title="$t('pulls.aiAvailable')"
          />
          <span v-else class="i-ph:stack-duotone" aria-hidden="true" />
          {{ $t('pulls.groups', viewed.groups) }}
        </span>
        <span
          v-if="pr.linkedIssues"
          class="flex items-center gap-1"
          :title="$t('pulls.linkedIssues', pr.linkedIssues)"
        >
          <span class="i-octicon-issue-closed-16" aria-hidden="true" />
          {{ pr.linkedIssues }}
        </span>
        <span v-if="pr.assignees.length" class="flex -space-x-1.5">
          <GithubAvatar
            v-for="assignee in pr.assignees"
            :key="assignee.login"
            :login="assignee.login"
            :avatar-url="assignee.avatarUrl"
            :size="20"
            class="ring-2 ring-base"
            :title="$t('pulls.assignedTo', { login: assignee.login })"
          />
        </span>
        <span
          v-if="pr.comments"
          class="flex items-center gap-1"
          :title="$t('pulls.comments', pr.comments)"
        >
          <span class="i-ph:chat-circle-duotone" aria-hidden="true" />
          {{ pr.comments }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>
