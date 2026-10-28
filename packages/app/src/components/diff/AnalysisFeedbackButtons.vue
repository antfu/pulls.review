<script setup lang="ts">
import type { AnalysisFeedback, AnalysisRating } from '../../analyze/remote-analyze'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { onMounted, ref } from 'vue'
import { fetchAnalysisFeedback, submitAnalysisFeedback } from '../../analyze/remote-analyze'
import { githubOauthSession, isGithubOauthAvailable } from '../../auth/github-oauth'

const props = defineProps<{
  owner: string
  repo: string
  number: number
}>()

// Useful / not-useful on the latest server analysis. Ratings feed offline
// evaluation only; they never change prompts silently.
const feedback = ref<AnalysisFeedback>()
const busy = ref(false)

onMounted(async () => {
  if (!isGithubOauthAvailable() || !githubOauthSession.value)
    return
  feedback.value = await fetchAnalysisFeedback(props).catch(() => undefined)
})

async function rate(rating: AnalysisRating) {
  if (busy.value || feedback.value?.mine.result === rating)
    return
  busy.value = true
  try {
    if (await submitAnalysisFeedback(props, rating))
      feedback.value = await fetchAnalysisFeedback(props).catch(() => feedback.value)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <span v-if="feedback" class="flex items-center gap-0.5">
    <ActionIconButton
      icon="i-ph:thumbs-up-duotone"
      :label="$t('pr.feedbackUseful')"
      :tooltip="$t('pr.feedbackUseful')"
      :class="feedback.mine.result === 'useful' ? 'color-accent-teal' : ''"
      :disabled="busy"
      @click="rate('useful')"
    />
    <ActionIconButton
      icon="i-ph:thumbs-down-duotone"
      :label="$t('pr.feedbackNotUseful')"
      :tooltip="$t('pr.feedbackNotUseful')"
      :class="feedback.mine.result === 'not_useful' ? 'text-red-500' : ''"
      :disabled="busy"
      @click="rate('not_useful')"
    />
  </span>
</template>
