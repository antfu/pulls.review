<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppModal from '../AppModal.vue'
import GithubAvatar from '../GithubAvatar.vue'

const props = defineProps<{
  open: boolean
  store: DiffsStore
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()

// Only opened when both are set - `DiffShareButton` gates on them.
const shared = computed(() => props.store.shared!)
// Results from before the language setting existed carry no locale and get no nudge.
const notEnglish = computed(() => {
  const locale = props.store.aiResult?.locale
  return locale !== undefined && locale !== 'en'
})

const confirmLabel = computed(() => {
  if (shared.value.ownComment)
    return notEnglish.value ? t('share.updateAnyway') : t('share.update')
  return notEnglish.value ? t('share.shareAnyway') : t('share.share')
})

async function confirm() {
  await shared.value.share()
  if (!shared.value.error)
    emit('update:open', false)
}
</script>

<template>
  <AppModal
    :title="$t(shared.ownComment ? 'share.titleUpdate' : 'share.titleShare')"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="w-full flex flex-col gap-3 text-sm">
      <i18n-t :keypath="shared.ownComment ? 'share.willUpdate' : 'share.willPost'" tag="p" scope="global">
        <template #comment>
          <a :href="shared.ownComment?.url" target="_blank" rel="noopener" class="underline">{{ $t('share.commentLink') }}</a>
        </template>
        <template #user>
          <span v-if="shared.viewerLogin" class="inline-flex items-center gap-1 align-middle">
            <span class="h-4 w-4 overflow-hidden rounded-full"><GithubAvatar :login="shared.viewerLogin" :size="16" /></span>
            <strong>{{ shared.viewerLogin }}</strong>
          </span>
          <template v-else>
            {{ $t('common.you') }}
          </template>
        </template>
      </i18n-t>

      <div class="flex flex-col gap-1">
        <p class="op-fade">
          {{ $t('share.contains') }}
        </p>
        <ul class="flex flex-col list-disc gap-0.5 pl-5">
          <i18n-t keypath="share.containsLink" tag="li" scope="global">
            <template #site>
              <span class="text-primary font-bold">pulls.review</span>
            </template>
          </i18n-t>
          <li>{{ $t('share.containsJson') }}</li>
        </ul>
        <p class="op-fade">
          {{ $t('share.excludes') }}
        </p>
      </div>

      <p class="op-fade">
        {{ $t('share.anyoneCanLoad') }}
      </p>

      <div v-if="notEnglish" class="flex items-start gap-2 border border-amber:20 rounded-lg bg-amber:10 px-3 py-2 text-amber-700 dark:text-amber-400">
        <span class="i-ph:globe-duotone mt-0.5 shrink-0" aria-hidden="true" />
        <span>{{ $t('share.englishRecommended') }}</span>
      </div>

      <p v-if="shared.error" class="text-red-600 dark:text-red-400">
        {{ shared.error.message }}
      </p>

      <div class="flex justify-end gap-2">
        <ActionButton variant="text" :disabled="shared.isSharing" @click="emit('update:open', false)">
          {{ $t('common.cancel') }}
        </ActionButton>
        <ActionButton variant="primary" icon="i-ph:share-network-duotone" :loading="shared.isSharing" @click="confirm">
          {{ confirmLabel }}
        </ActionButton>
      </div>
    </div>
  </AppModal>
</template>
