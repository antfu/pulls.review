<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { githubOauthSession, signInWithGithub } from '../auth/github-oauth'
import AppHeader from '../components/AppHeader.vue'
import { useRepositoryConnections } from '../components/repositories/useRepositoryConnections'
import { useDocumentTitle } from '../composables/useDocumentTitle'

const { t } = useI18n()
useDocumentTitle(() => t('repos.title'))
const route = useRoute()
const { host, installations, repositories, installationId, loading, loadingRepositories, error, refresh } = useRepositoryConnections()
const search = ref('')
const installation = computed(() => installations.value.find(item => String(item.id) === installationId.value))
const options = computed(() => installations.value.map(item => ({ value: String(item.id), label: item.account })))
const filtered = computed(() => repositories.value.filter(repo => `${repo.owner}/${repo.name}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const connected = computed(() => host.value?.oauth && host.value.installations && host.value.githubAppSlug)
</script>

<template>
  <div class="min-h-screen bg-base color-base">
    <AppHeader />
    <main class="mxa max-w-6xl px-5 py-10 sm:px-8">
      <div class="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div class="max-w-2xl">
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
            {{ $t('repos.title') }}
          </h1>
          <p class="mt-3 max-w-xl text-base color-faint leading-relaxed">
            {{ $t('repos.intro') }}
          </p>
        </div>
        <ActionButton v-if="connected && githubOauthSession" href="/api/github/install" variant="primary" icon="i-ph:plus-bold">
          {{ $t('repos.connect') }}
        </ActionButton>
      </div>

      <p v-if="route.query.connected" role="status" class="border-accent-teal mb-6 border-l-3 bg-raised p-4 text-sm">
        {{ $t('repos.returned') }}
      </p>
      <FeedbackLoading v-if="loading || githubOauthSession === undefined" :text="$t('common.loading')" class="py-12" />
      <FeedbackEmptyState v-else-if="error" icon="i-ph:warning-duotone" :title="$t('repos.loadFailed')">
        <template #actions>
          <ActionButton @click="refresh">
            {{ $t('common.retry') }}
          </ActionButton>
        </template>
      </FeedbackEmptyState>
      <section v-else-if="!connected" class="max-w-2xl border border-base rounded-xl bg-raised p-6 sm:p-8">
        <span class="i-ph:plug-duotone inline-block text-3xl color-accent-orange" aria-hidden="true" />
        <h2 class="mt-4 text-xl font-semibold">
          {{ $t('repos.hostSetup') }}
        </h2>
        <p class="my-4 text-sm color-faint leading-relaxed">
          {{ $t('repos.hostSetupHint') }}
        </p>
        <div class="flex flex-wrap gap-3">
          <ActionButton href="/api/github/app/new" icon="i-simple-icons-github">
            {{ $t('repos.registerApp') }}
          </ActionButton>
          <ActionButton variant="text" @click="refresh">
            {{ $t('common.refresh') }}
          </ActionButton>
        </div>
      </section>
      <section v-else-if="!githubOauthSession || !installations.length" class="grid gap-10 border-y border-base py-8 md:grid-cols-[1.2fr_1fr]">
        <div class="max-w-lg">
          <span class="i-ph:git-branch-duotone inline-block text-4xl color-accent-teal" aria-hidden="true" />
          <h2 class="mt-5 text-2xl font-semibold">
            {{ $t('repos.start') }}
          </h2>
          <p class="mb-6 mt-3 text-sm color-faint leading-relaxed">
            {{ $t('repos.installHint') }}
          </p>
          <ActionButton v-if="!githubOauthSession" variant="primary" icon="i-simple-icons-github" @click="signInWithGithub('/repositories')">
            {{ $t('settings.token.signIn') }}
          </ActionButton>
          <ActionButton v-else href="/api/github/install" variant="primary" icon="i-simple-icons-github">
            {{ $t('repos.connect') }}
          </ActionButton>
          <ActionButton v-if="githubOauthSession" class="ml-2" variant="text" @click="refresh">
            {{ $t('common.refresh') }}
          </ActionButton>
        </div>
        <ol class="flex flex-col gap-6 text-sm">
          <li class="flex gap-4">
            <span class="text-lg color-accent-teal font-mono">1</span><div>
              <h3 class="font-semibold">
                {{ $t('settings.token.signIn') }}
              </h3><p class="mt-1 color-faint">
                {{ $t('repos.signInHint') }}
              </p>
            </div>
          </li>
          <li class="flex gap-4">
            <span class="text-lg color-accent-teal font-mono">2</span><div>
              <h3 class="font-semibold">
                {{ $t('repos.connect') }}
              </h3><p class="mt-1 color-faint">
                {{ $t('repos.chooseHint') }}
              </p>
            </div>
          </li>
          <li class="flex gap-4">
            <span class="text-lg color-accent-teal font-mono">3</span><div>
              <h3 class="font-semibold">
                {{ $t('repos.scanSettings') }}
              </h3><p class="mt-1 color-faint">
                {{ $t('repos.optInHint') }}
              </p>
            </div>
          </li>
        </ol>
      </section>
      <template v-else>
        <div class="mb-5 flex flex-wrap items-center gap-3">
          <DisplayAvatar v-if="installation" :src="installation.avatarUrl" :name="installation.account" :size="28" />
          <FormSelect v-model="installationId" :options="options" :aria-label="$t('repos.account')" />
          <ActionButton v-if="installation" :href="installation.manageUrl" target="_blank" rel="noopener noreferrer" variant="text" size="sm" icon="i-ph:arrow-square-out">
            {{ $t('repos.manageAccess') }}
          </ActionButton>
          <div class="flex-1" />
          <FormTextInput v-model="search" icon="i-ph:magnifying-glass" :placeholder="$t('repos.search')">
            <template #prefix>
              <span class="sr-only">{{ $t('repos.search') }}</span>
            </template>
          </FormTextInput>
          <ActionButton :loading="loadingRepositories" @click="refresh">
            {{ $t('common.refresh') }}
          </ActionButton>
        </div>
        <p v-if="installation?.suspended" role="status" class="border-accent-orange mb-4 border-l-3 p-4 text-sm">
          {{ $t('repos.suspended') }}
        </p>
        <FeedbackLoading v-if="loadingRepositories" :text="$t('common.loading')" class="py-12" />
        <FeedbackEmptyState v-else-if="!filtered.length" icon="i-ph:folder-simple-duotone" :title="search ? $t('pulls.noMatches') : $t('repos.empty')">
          <template #hint>
            {{ $t('repos.emptyHint') }}
          </template>
        </FeedbackEmptyState>
        <ul v-else class="divide-base border-y border-base divide-y">
          <li v-for="repo in filtered" :key="repo.id" class="flex flex-wrap items-center gap-4 border-b border-base py-5">
            <span class="i-octicon:repo-16 hidden text-2xl color-faint sm:block" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/gh/${repo.owner}/${repo.name}`" class="break-all text-base font-semibold hover:underline">
                {{ repo.name }}
              </RouterLink>
              <span class="ml-2 text-xs color-faint">{{ repo.private ? $t('repos.private') : $t('repos.public') }}</span>
              <span v-if="repo.archived" class="ml-2 text-xs color-accent-orange">{{ $t('repos.archived') }}</span>
              <p v-if="repo.description" class="mt-1 max-w-xl truncate text-sm color-faint">
                {{ repo.description }}
              </p>
            </div>
            <RouterLink :to="`/gh/${repo.owner}/${repo.name}`" class="btn-text text-sm">
              {{ $t('repos.review') }}
            </RouterLink>
            <RouterLink :to="`/repositories/${repo.owner}/${repo.name}`" class="btn-action text-sm">
              {{ $t('repos.scanSettings') }}
            </RouterLink>
          </li>
        </ul>
        <p class="mt-5 text-sm color-faint">
          {{ $t('repos.adminHint') }}
        </p>
      </template>
    </main>
  </div>
</template>
