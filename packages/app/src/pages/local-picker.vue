<script setup lang="ts">
import type { RefSuggestion } from '../components/RefAutocomplete.vue'
import type { RepoInfo } from '../local/pages'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppFooter from '../components/AppFooter.vue'
import AppHeader from '../components/AppHeader.vue'
import DiffPill from '../components/DiffPill.vue'
import LandingDemo from '../components/landing/LandingDemo.vue'
import LandingHero from '../components/landing/LandingHero.vue'
import RefAutocomplete from '../components/RefAutocomplete.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { localRpcKey } from '../local/local-rpc-key'
import { readRepoInfo, routeForPage } from '../local/pages'

/** Branches shown as shortcuts; the rest stay reachable by typing them. */
const BRANCH_LIMIT = 8

// Only `installLocal` registers this page, after providing the RPC client.
const rpc = inject(localRpcKey)!
const router = useRouter()
const { t } = useI18n()

const info = ref<RepoInfo>()
const base = ref('')
const head = ref('')
const suggestions = computed<RefSuggestion[]>(() => [
  ...(info.value?.branches ?? []).map(name => ({ name, kind: 'branch' as const })),
  ...(info.value?.tags ?? []).map(name => ({ name, kind: 'tag' as const })),
])
/** The checked-out branch, when it isn't the default branch itself. */
const currentBranch = computed(() => {
  const current = info.value?.currentBranch
  return current && current !== info.value?.defaultBranch?.name ? current : undefined
})
/** Most recently committed first, without the default branch and the current one (it has its own shortcut). */
const otherBranches = computed(() => (info.value?.branches ?? [])
  .filter(name => name !== info.value?.defaultBranch?.name && name !== currentBranch.value)
  .slice(0, BRANCH_LIMIT))

onMounted(async () => {
  info.value = await readRepoInfo(rpc)
  base.value ||= info.value.defaultBranch?.ref ?? ''
  head.value ||= info.value.currentBranch ?? 'HEAD'
})

function compare() {
  router.push(routeForPage({ kind: 'compare', range: `${base.value.trim()}...${head.value.trim()}` }))
}

useDocumentTitle(() => t('local.picker.title'))
</script>

<template>
  <div class="relative min-h-screen flex flex-col">
    <AppHeader />

    <main class="mxa max-w-6xl w-full flex flex-1 flex-col gap-20 px-6 py-16 sm:py-20">
      <section class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div class="flex flex-col gap-8">
          <LandingHero />
          <p class="max-w-md text-sm leading-relaxed op-fade">
            {{ $t('local.picker.tagline') }}
          </p>
          <form class="max-w-md flex flex-col gap-2" @submit.prevent="compare">
            <div class="flex items-stretch gap-2">
              <RefAutocomplete v-model="base" :suggestions="suggestions" :placeholder="$t('local.picker.base')" icon="i-ph:git-branch-duotone" class="flex-1" />
              <span class="self-center font-mono op-fade" aria-hidden="true">...</span>
              <RefAutocomplete v-model="head" :suggestions="suggestions" :placeholder="$t('local.picker.head')" class="flex-1" />
              <ActionButton
                type="submit"
                variant="primary"
                class="pl-3 pr-4"
                icon="i-ph-arrow-right-bold"
                :disabled="!base.trim() || !head.trim()"
              >
                {{ $t('local.picker.compare') }}
              </ActionButton>
            </div>
          </form>
        </div>

        <LandingDemo class="min-w-0 w-full" />
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('local.picker.shortcuts') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <DiffPill
            v-if="currentBranch && info?.defaultBranch"
            :to="routeForPage({ kind: 'branch', branch: currentBranch })"
            :parent="currentBranch"
          >
            <span class="text-xs op-fade">{{ $t('local.picker.against', { base: info.defaultBranch.ref }) }}</span>
          </DiffPill>
          <DiffPill :to="routeForPage({ kind: 'worktree' })" :parent="$t('local.picker.worktree')" />
        </div>
      </section>

      <section v-if="otherBranches.length && info?.defaultBranch" class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('local.picker.branches') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <DiffPill
            v-for="branch in otherBranches"
            :key="branch"
            :to="routeForPage({ kind: 'branch', branch })"
            :parent="branch"
          />
        </div>
      </section>

      <section v-if="info?.commits.length" class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('local.picker.recentCommits') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <DiffPill
            v-for="commit in info.commits"
            :key="commit.sha"
            :to="routeForPage({ kind: 'commit', sha: commit.sha })"
            :label="commit.sha.slice(0, 7)"
            :title="commit.subject"
          >
            <span class="max-w-56 truncate text-xs op-fade">{{ commit.subject }}</span>
          </DiffPill>
        </div>
      </section>
    </main>

    <AppFooter />
  </div>
</template>
