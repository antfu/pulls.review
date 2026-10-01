<script setup lang="ts">
import type { DiffsStore, SharedAnalysisCandidate } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { nativeLocaleName } from '@pulls.review/core/locales'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{
  store: DiffsStore
}>()

const { t, locale } = useI18n()

// Only rendered when `store.shared` is set - `DiffsPage` gates on it.
const shared = computed(() => props.store.shared!)
const replacesLocal = computed(() => props.store.aiResult !== undefined && props.store.aiResult.sharedBy === undefined)

/** The language a candidate was written in, when it differs from the UI's; results from before the setting existed pass silently. */
function otherLanguage(candidate: SharedAnalysisCandidate): string | undefined {
  const written = candidate.result.locale
  return written !== undefined && written !== locale.value ? nativeLocaleName(written) : undefined
}

function candidateTitle(candidate: SharedAnalysisCandidate): string | undefined {
  const language = otherLanguage(candidate)
  if (candidate.stale)
    return t('share.staleTitle')
  if (language)
    return t('share.inLanguage', { language })
  return candidate.result.model
}
</script>

<template>
  <div
    v-if="shared.candidates.length || shared.notice"
    class="flex flex-wrap items-center gap-x-3 gap-y-2 border border-base rounded-lg bg-raised px-3 py-2 text-sm"
  >
    <span class="i-ph-sparkle-duotone shrink-0 op-fade" aria-hidden="true" />
    <template v-if="shared.candidates.length">
      <span>{{ $t(replacesLocal ? 'share.loadReplaces' : 'share.available') }}</span>
      <ActionButton
        v-for="candidate in shared.candidates"
        :key="candidate.login"
        size="sm"
        class="rounded-full"
        :title="candidateTitle(candidate)"
        @click="shared.load(candidate.login)"
      >
        <GithubAvatar :login="candidate.login" :size="16" />
        {{ candidate.own ? $t('common.you') : candidate.login }}
        <span v-if="candidate.stale" class="text-xs op-fade">{{ $t('share.outdated') }}</span>
        <span v-else-if="otherLanguage(candidate)" class="text-xs op-fade">({{ otherLanguage(candidate) }})</span>
      </ActionButton>
    </template>
    <span v-else class="op-fade">{{ shared.notice }}</span>
    <div class="flex-auto" />
    <ActionIconButton icon="i-ph:x" :label="$t('common.dismiss')" :tooltip="$t('common.dismiss')" class="text-sm" @click="shared.dismiss()" />
  </div>
</template>
