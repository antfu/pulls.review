<script setup lang="ts">
import type { DiffsStore } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed } from 'vue'
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

// Only opened when both are set - `DiffShareButton` gates on them.
const shared = computed(() => props.store.shared!)
const result = computed(() => props.store.aiResult!)
const groupCount = computed(() => result.value.groups.reduce((count, group) => count + 1 + (group.children?.length ?? 0), 0))

async function confirm() {
  await shared.value.share()
  if (!shared.value.error)
    emit('update:open', false)
}
</script>

<template>
  <AppModal
    :title="shared.ownComment ? 'Update your shared analysis' : 'Share this analysis on GitHub'"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="text-sm flex flex-col gap-3 w-full sm:w-110">
      <p>
        <template v-if="shared.ownComment">
          Your existing <a :href="shared.ownComment.url" target="_blank" rel="noopener" class="underline">comment</a> on this pull request will be updated
        </template>
        <template v-else>
          A public comment will be posted on this pull request
        </template>
        as
        <span v-if="shared.viewerLogin" class="align-text-bottom inline-flex gap-1 items-center">
          <span class="rounded-full h-4 w-4 overflow-hidden"><GithubAvatar :login="shared.viewerLogin" :size="16" /></span>
          <strong>{{ shared.viewerLogin }}</strong>
        </span>
        <template v-else>
          you
        </template>
        with your GitHub token.
      </p>

      <div class="flex flex-col gap-1">
        <p class="op-fade">
          The comment contains:
        </p>
        <ul class="pl-5 list-disc flex flex-col gap-0.5">
          <li>
            the {{ groupCount }} group{{ groupCount === 1 ? '' : 's' }} and summaries of this AI analysis
            <template v-if="result.model">
              (by <code class="text-xs">{{ result.model }}</code>)
            </template>
            as JSON inside a collapsed block
          </li>
          <li>a link to open this review on pulls.review</li>
        </ul>
        <p class="op-fade">
          Not included: your chat messages, API keys, or anything else from your settings.
        </p>
      </div>

      <p class="op-fade">
        Anyone viewing the pull request can load the shared analysis instead of running their own - including in the github.com embed, which cannot call AI providers itself.
      </p>

      <p v-if="shared.error" class="text-red-600 dark:text-red-400">
        {{ shared.error.message }}
      </p>

      <div class="flex gap-2 justify-end">
        <ActionButton variant="text" :disabled="shared.isSharing" @click="emit('update:open', false)">
          Cancel
        </ActionButton>
        <ActionButton variant="primary" icon="i-ph:share-network-duotone" :loading="shared.isSharing" @click="confirm">
          {{ shared.ownComment ? 'Update comment' : 'Post comment' }}
        </ActionButton>
      </div>
    </div>
  </AppModal>
</template>
