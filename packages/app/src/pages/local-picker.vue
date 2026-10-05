<script setup lang="ts">
import type { RepoInfo } from '../local/pages'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import NavControls from '../components/NavControls.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { localRpcKey } from '../local/local-rpc-key'
import { readRepoInfo, routeForPage } from '../local/pages'

// Only `installLocal` registers this page, after providing the RPC client.
const rpc = inject(localRpcKey)!
const router = useRouter()
const { t } = useI18n()

const info = ref<RepoInfo>()
const base = ref('')
const head = ref('')
const refs = computed(() => [...info.value?.branches ?? [], ...info.value?.tags ?? []])
/** The checked-out branch, when it isn't the default branch itself. */
const currentBranch = computed(() => {
  const current = info.value?.currentBranch
  return current && current !== info.value?.defaultBranch?.name ? current : undefined
})

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
  <main class="mxa max-w-180 flex flex-col gap-6 px-4 py-8">
    <header class="flex items-center gap-2">
      <h1 class="flex-auto text-lg font-semibold">
        {{ $t('local.picker.title') }}
      </h1>
      <NavControls />
    </header>

    <form class="flex flex-wrap items-end gap-2" @submit.prevent="compare">
      <label class="flex flex-col gap-1 text-sm">
        <span class="op-fade">{{ $t('local.picker.base') }}</span>
        <input v-model="base" list="local-refs" class="h-9 border border-base rounded bg-raised px-2 font-mono">
      </label>
      <span class="pb-2 op-fade">...</span>
      <label class="flex flex-col gap-1 text-sm">
        <span class="op-fade">{{ $t('local.picker.head') }}</span>
        <input v-model="head" list="local-refs" class="h-9 border border-base rounded bg-raised px-2 font-mono">
      </label>
      <datalist id="local-refs">
        <option v-for="name in refs" :key="name" :value="name" />
      </datalist>
      <ActionButton variant="primary" type="submit" :disabled="!base.trim() || !head.trim()">
        {{ $t('local.picker.compare') }}
      </ActionButton>
    </form>

    <section class="flex flex-col gap-2">
      <h2 class="text-xs font-mono op-fade">
        {{ $t('local.picker.shortcuts') }}
      </h2>
      <RouterLink
        v-if="currentBranch && info?.defaultBranch"
        :to="routeForPage({ kind: 'branch', branch: currentBranch })"
        class="flex items-center gap-2 hover:underline"
      >
        <span class="i-ph:git-branch-duotone" aria-hidden="true" />
        {{ $t('local.picker.currentBranch', { branch: currentBranch, base: info.defaultBranch.ref }) }}
      </RouterLink>
      <RouterLink :to="routeForPage({ kind: 'worktree' })" class="flex items-center gap-2 hover:underline">
        <span class="i-ph:pencil-simple-line-duotone" aria-hidden="true" />
        {{ $t('local.picker.worktree') }}
      </RouterLink>
    </section>

    <section v-if="info?.commits.length" class="flex flex-col gap-2">
      <h2 class="text-xs font-mono op-fade">
        {{ $t('local.picker.recentCommits') }}
      </h2>
      <RouterLink
        v-for="commit in info.commits"
        :key="commit.sha"
        :to="routeForPage({ kind: 'commit', sha: commit.sha })"
        class="flex items-center gap-2 hover:underline"
      >
        <code class="text-xs op-fade">{{ commit.sha.slice(0, 7) }}</code>
        <span class="truncate">{{ commit.subject }}</span>
      </RouterLink>
    </section>
  </main>
</template>
