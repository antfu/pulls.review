<script setup lang="ts">
import type { PullRequestListStore } from '../../stores/pull-request-list-store'
import type { PullRequestSort } from './pull-request-list-query'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { repositoryName } from '../../source-routes'
import GithubAvatar from '../GithubAvatar.vue'
import NavControls from '../NavControls.vue'
import { PULL_REQUEST_SORTS } from './pull-request-list-query'

const props = defineProps<{
  store: PullRequestListStore
  scrollY: number
}>()

const repository = computed(() => repositoryName(props.store.source.repository))

const query = defineModel<string>('query', { required: true })
const sort = defineModel<PullRequestSort>('sort', { required: true })

const { t } = useI18n()
const sortOptions = computed(() => PULL_REQUEST_SORTS.map(value => ({ value, label: t(`pulls.sort.${value}`) })))
</script>

<template>
  <header
    class="sticky left-0 right-0 top-0 z-nav flex flex-col gap-2 border-b bg-base px4 py2 transition-all"
    :class="scrollY > 20 ? 'border-base shadow-md' : 'border-transparent'"
  >
    <div class="mxa max-w-6xl w-full flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink to="/" class="flex">
          <span class="i-ph-house-line-duotone text-lg color-accent-teal" aria-hidden="true" />
        </RouterLink>
        <h1 class="flex flex-auto items-center gap-1.5 text-lg font-semibold">
          <a :href="store.source.ownerUrl" target="_blank" rel="noopener" class="flex items-center gap-1.5 op-fade hover:underline">
            <GithubAvatar :login="repository.owner" :auth="store.source.auth" :size="20" />
            {{ repository.owner }}
          </a>
          <span class="op-mute">/</span>
          <a :href="store.source.url" target="_blank" rel="noopener" class="hover:underline">{{ repository.name }}</a>
          <span v-if="store.totalCount !== undefined" class="ml-1 text-sm font-normal op-fade">{{ $t('pulls.open', { n: store.totalCount }) }}</span>
          <ActionIconButton
            icon="i-ph:arrows-clockwise-duotone"
            :label="$t('common.refresh')" :tooltip="$t('common.refresh')"
            class="shrink-0 text-sm" :class="{ 'animate-spin': store.isRefreshing }" @click="store.refresh()"
          />
        </h1>
        <div class="shrink-0">
          <NavControls />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <FormSearchField v-model="query" :placeholder="$t('pulls.search')" size="sm" class="min-w-60 flex-1" />
        <FormSelect v-model="sort" :options="sortOptions" class="min-w-48 h-7!" :aria-label="$t('pulls.sort.label')" />
      </div>
    </div>
  </header>
</template>
