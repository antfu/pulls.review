<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed } from 'vue'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{
  store: DiffsStore
}>()

// Only rendered when `store.shared` is set - `DiffsPage` gates on it.
const shared = computed(() => props.store.shared!)
const replacesLocal = computed(() => props.store.aiResult !== undefined && props.store.aiResult.sharedBy === undefined)
</script>

<template>
  <div
    v-if="shared.candidates.length || shared.notice"
    class="text-sm px-3 py-2 border border-base rounded-lg bg-raised flex flex-wrap gap-x-3 gap-y-2 items-center"
  >
    <span class="i-ph-sparkle-duotone op-fade shrink-0" aria-hidden="true" />
    <template v-if="shared.candidates.length">
      <span>
        <template v-if="replacesLocal">Load a shared AI analysis? It replaces yours:</template>
        <template v-else>Shared AI analyses of this pull request available:</template>
      </span>
      <ActionButton
        v-for="candidate in shared.candidates"
        :key="candidate.login"
        size="sm"
        class="rounded-full"
        :title="candidate.stale ? 'Analyzed before the latest commits' : candidate.result.model"
        @click="shared.load(candidate.login)"
      >
        <GithubAvatar :login="candidate.login" :size="16" />
        {{ candidate.own ? 'you' : candidate.login }}
        <span v-if="candidate.stale" class="text-xs op-fade">(outdated)</span>
      </ActionButton>
    </template>
    <span v-else class="op-fade">{{ shared.notice }}</span>
    <div class="flex-auto" />
    <ActionIconButton icon="i-ph:x" label="Dismiss" tooltip="Dismiss" class="text-sm" @click="shared.dismiss()" />
  </div>
</template>
