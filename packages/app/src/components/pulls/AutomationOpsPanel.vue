<script setup lang="ts">
import type { AutomationOps } from '../../analyze/remote-analyze'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchAutomationOps } from '../../analyze/remote-analyze'
import { githubOauthSession, isGithubOauthAvailable } from '../../auth/github-oauth'

const props = defineProps<{
  owner: string
  repo: string
}>()

// Admin-only operations summary: the API hides it from non-admins, so the
// panel simply never renders for anyone else.
const ops = ref<AutomationOps>()

onMounted(async () => {
  if (!isGithubOauthAvailable() || !githubOauthSession.value)
    return
  ops.value = await fetchAutomationOps({ owner: props.owner, repo: props.repo }).catch(() => undefined)
})

function jobIcon(status: string): string {
  if (status === 'succeeded')
    return 'i-ph:check-circle-duotone text-green-500'
  if (status === 'failed')
    return 'i-ph:x-circle-duotone text-red-500'
  if (status === 'running' || status === 'queued')
    return 'i-ph:spinner-duotone animate-spin'
  return 'i-ph:minus-circle-duotone'
}
</script>

<template>
  <section v-if="ops" class="mb-4 border border-base rounded-lg p-4">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <h2 class="flex items-center gap-1.5 text-sm font-600">
        <span class="i-ph:robot-duotone" />
        {{ $t('automation.title') }}
      </h2>
      <span class="text-xs" :class="ops.config?.enabled ? 'text-green-600' : 'op60'">
        {{ ops.config?.enabled ? $t('automation.enabled') : $t('automation.disabled') }}
      </span>
      <span class="text-xs op60">
        {{ ops.usage.budget === null ? $t('automation.usageUnlimited', { runs: ops.usage.runs }) : $t('automation.usage', { runs: ops.usage.runs, budget: ops.usage.budget }) }}
      </span>
    </div>

    <ul v-if="ops.jobs.length" class="mt-3 flex flex-col gap-1">
      <li v-for="job in ops.jobs.slice(0, 5)" :key="job.id" class="flex items-center gap-2 text-xs">
        <span :class="jobIcon(job.status)" />
        <RouterLink :to="`/gh/${job.owner}/${job.repo}/${job.number}`" class="hover:underline">
          #{{ job.number }}
        </RouterLink>
        <span class="op60">{{ job.status }}</span>
        <span class="op60">{{ job.keySource }}</span>
        <span v-if="job.errorMessage" class="max-w-80 truncate text-red-500" :title="job.errorMessage">{{ job.errorMessage }}</span>
      </li>
    </ul>
    <p v-else class="mt-2 text-xs op60">
      {{ $t('automation.empty') }}
    </p>
  </section>
</template>
