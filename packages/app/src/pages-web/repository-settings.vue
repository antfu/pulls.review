<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import FormField from '@antfu/design/components/Form/FormField.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import OverlayConfirm from '@antfu/design/components/Overlay/OverlayConfirm.vue'
import { LOCALES } from '@pulls.review/core/locales'
import { useConfirmDialog, useEventListener } from '@vueuse/core'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, RouterLink, useRoute } from 'vue-router'
import { githubOauthSession, signInWithGithub } from '../auth/github-oauth'
import AppHeader from '../components/AppHeader.vue'
import { useScanSettings } from '../components/repositories/useScanSettings'
import { useDocumentTitle } from '../composables/useDocumentTitle'

const route = useRoute()
const owner = String(route.params.owner)
const repo = String(route.params.repo)
const { t } = useI18n()
useDocumentTitle(() => `${owner}/${repo} · ${t('repos.scanSettings')}`)
const { settings, runs, connection, host, loading, saving, error, saved, forbidden, draft, apiKey, dirty, model, storedKey, ready, valid, provider, load, save, inherit, refreshRuns } = useScanSettings(owner, repo)
const providers = [
  { value: 'gateway', label: 'Vercel AI Gateway' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
]
const languages = LOCALES.map(locale => ({ value: locale.code, label: locale.native }))
const statuses = computed(() => ({ queued: t('repos.queued'), running: t('repos.running'), succeeded: t('repos.succeeded'), failed: t('repos.failed'), skipped: t('repos.skipped'), cancelled: t('repos.cancelled'), superseded: t('repos.superseded') }))
watch(() => githubOauthSession.value?.id, (id) => {
  if (id)
    void load()
}, { immediate: true })
const { isRevealed, reveal, confirm, cancel } = useConfirmDialog()
onBeforeRouteLeave(async () => !dirty.value || !(await reveal()).isCanceled)
useEventListener('beforeunload', (event) => {
  if (dirty.value)
    event.preventDefault()
})
</script>

<template>
  <div class="min-h-screen bg-base color-base">
    <AppHeader />
    <OverlayConfirm :open="isRevealed" :title="$t('repos.unsaved')" :confirm-label="$t('repos.leave')" :cancel-label="$t('common.cancel')" @confirm="confirm" @cancel="cancel" />
    <main class="mxa max-w-6xl px-5 py-10 sm:px-8">
      <RouterLink to="/repositories" class="text-sm color-faint hover:color-base">
        ← {{ $t('repos.title') }}
      </RouterLink>
      <div class="mb-8 mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mb-2 text-sm color-faint">
            {{ $t('repos.scanSettings') }}
          </p><h1 class="break-all text-2xl font-semibold tracking-tight sm:text-3xl">
            {{ owner }}<span class="mx-1 color-faint">/</span>{{ repo }}
          </h1>
        </div>
        <RouterLink :to="`/gh/${owner}/${repo}`" class="btn-action text-sm">
          {{ $t('repos.review') }}
        </RouterLink>
      </div>
      <FeedbackLoading v-if="githubOauthSession === undefined" :text="$t('common.loading')" />
      <FeedbackEmptyState v-else-if="!githubOauthSession" :title="$t('settings.token.signIn')" icon="i-simple-icons-github">
        <template #hint>
          {{ $t('repos.signInHint') }}
        </template>
        <template #actions>
          <ActionButton variant="primary" @click="signInWithGithub(route.path)">
            {{ $t('settings.token.signIn') }}
          </ActionButton>
        </template>
      </FeedbackEmptyState>
      <FeedbackLoading v-else-if="loading" :text="$t('common.loading')" />
      <FeedbackEmptyState v-else-if="forbidden" :title="$t('repos.adminHint')" icon="i-ph:lock-duotone" />
      <FeedbackEmptyState v-else-if="error === 'load'" :title="$t('repos.loadFailed')" icon="i-ph:warning-duotone">
        <template #actions>
          <ActionButton @click="load">
            {{ $t('common.retry') }}
          </ActionButton>
        </template>
      </FeedbackEmptyState>
      <div v-else class="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <form class="flex flex-col gap-6" @submit.prevent="save">
          <div v-if="!ready" class="border-accent-orange border-l-3 bg-raised p-4 text-sm leading-relaxed">
            <template v-if="!connection?.installed">
              <p>{{ $t('repos.installHint') }}</p><ActionButton href="/api/github/install" class="mt-3">
                {{ $t('repos.connect') }}
              </ActionButton>
            </template>
            <p v-else-if="connection.suspended">
              {{ $t('repos.suspended') }}
            </p>
            <p v-else-if="connection.archived">
              {{ $t('repos.archived') }}
            </p>
            <p v-else-if="!host?.webhook">
              {{ $t('repos.webhookMissing') }}
            </p>
          </div>
          <div v-if="settings?.inherited" class="border-accent-teal border-l-3 bg-raised p-4 text-sm leading-relaxed">
            <p>{{ settings.config ? $t('repos.overrideHint') : $t('repos.inheritedHint') }}</p>
            <ActionButton v-if="settings.config" type="button" class="mt-3" :loading="saving" :disabled="dirty" @click="inherit">
              {{ $t('repos.useDefaults') }}
            </ActionButton>
          </div>
          <section class="border border-base rounded-xl p-5 sm:p-6">
            <FormCheckbox v-model="draft.enabled" :disabled="saving || (!ready && !draft.enabled)" :label="$t('repos.enable')" />
            <p class="ml-7 mt-2 text-sm color-faint leading-relaxed">
              {{ $t('repos.optInHint') }}
            </p>
          </section>
          <fieldset :disabled="saving" class="min-w-0 flex flex-col gap-5 border border-base rounded-xl p-5 sm:p-6">
            <legend class="px-2 font-semibold">
              {{ $t('settings.llm.title') }}
            </legend>
            <FormField :label="$t('settings.llm.provider')">
              <FormSelect v-model="provider" :options="providers" :aria-label="$t('settings.llm.provider')" />
            </FormField>
            <FormField :label="$t('settings.llm.model')">
              <FormTextInput v-model="model" :placeholder="$t('settings.models.placeholder')">
                <template #prefix>
                  <span class="sr-only">{{ $t('settings.llm.model') }}</span>
                </template>
              </FormTextInput>
            </FormField>
            <FormField v-if="provider === 'openai-compatible'" :label="$t('settings.llm.baseUrl')">
              <FormTextInput v-model="draft.llm.openaiBaseUrl" type="url">
                <template #prefix>
                  <span class="sr-only">{{ $t('settings.llm.baseUrl') }}</span>
                </template>
              </FormTextInput>
            </FormField>
            <FormField :label="$t('settings.llm.apiKey')" :description="storedKey ? $t('repos.keySaved') : $t('repos.keyHint')">
              <FormTextInput v-model="apiKey" type="password" autocomplete="new-password" :placeholder="storedKey ? $t('settings.llm.configured') : ''">
                <template #prefix>
                  <span class="sr-only">{{ $t('settings.llm.apiKey') }}</span>
                </template>
              </FormTextInput>
            </FormField>
            <FormField :label="$t('repos.budget')" :description="$t('repos.budgetHint')">
              <FormTextInput v-model="draft.budget" type="number" min="1" max="100000" step="1">
                <template #prefix>
                  <span class="sr-only">{{ $t('repos.budget') }}</span>
                </template>
              </FormTextInput>
            </FormField>
          </fieldset>
          <fieldset :disabled="saving" class="min-w-0 flex flex-col gap-5 border border-base rounded-xl p-5 sm:p-6">
            <legend class="px-2 font-semibold">
              {{ $t('repos.behavior') }}
            </legend>
            <FormCheckbox v-model="draft.includeDrafts" :label="$t('repos.drafts')" />
            <FormCheckbox v-model="draft.publishCheckRun" :label="$t('repos.checks')" />
            <FormField :label="$t('repos.excludes')" :description="$t('repos.excludesHint')">
              <FormTextarea v-model="draft.excludePaths" :rows="3" :aria-label="$t('repos.excludes')" placeholder="dist/**" />
            </FormField>
            <FormField :label="$t('settings.language')">
              <FormSelect v-model="draft.locale" :options="languages" :aria-label="$t('settings.language')" />
            </FormField>
          </fieldset>
          <div class="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-base bg-base py-4">
            <ActionButton type="submit" variant="primary" :loading="saving" :disabled="!dirty || !valid">
              {{ $t('common.save') }}
            </ActionButton>
            <span v-if="error === 'save'" role="alert" class="text-sm text-red-500">{{ $t('repos.saveFailed') }}</span>
            <span v-else-if="saved && !dirty" role="status" class="text-sm color-accent-teal">{{ $t('repos.saved') }}</span>
            <span v-else-if="dirty && !valid" class="text-sm color-faint">{{ $t('repos.required') }}</span>
          </div>
        </form>
        <aside class="border border-base rounded-xl bg-raised p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">
              {{ $t('repos.recent') }}
            </h2><ActionButton size="sm" variant="text" @click="refreshRuns">
              {{ $t('common.refresh') }}
            </ActionButton>
          </div>
          <p v-if="runs" class="mt-2 text-sm color-faint">
            {{ runs.usage.budget === null ? $t('automation.usageUnlimited', { runs: runs.usage.runs }) : $t('automation.usage', { runs: runs.usage.runs, budget: runs.usage.budget }) }}
          </p>
          <p v-if="!settings?.config && settings?.inherited" class="mt-2 text-xs color-faint">
            {{ $t('repos.orgUsage') }}
          </p>
          <p v-if="error === 'history'" role="alert" class="mt-4 text-sm text-red-500">
            {{ $t('repos.loadFailed') }}
          </p>
          <ul v-if="runs?.jobs.length" class="divide-base mt-5 divide-y">
            <li v-for="job in runs.jobs" :key="job.id" class="border-b border-base py-3 text-sm last:border-b-0">
              <div class="flex items-center justify-between gap-3">
                <RouterLink :to="`/gh/${owner}/${repo}/${job.number}`" class="font-mono hover:underline">
                  #{{ job.number }}
                </RouterLink><span :class="job.status === 'failed' ? 'text-red-500' : 'color-faint'">{{ statuses[job.status] }}</span>
              </div>
              <p v-if="job.errorMessage" class="mt-2 break-words text-xs text-red-500">
                {{ job.errorMessage }}
              </p>
            </li>
          </ul>
          <p v-else class="mt-6 text-sm color-faint leading-relaxed">
            {{ $t('repos.noRuns') }}
          </p>
        </aside>
      </div>
    </main>
  </div>
</template>
