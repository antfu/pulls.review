<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import AppModal from '../AppModal.vue'
import BookmarkletButton from './BookmarkletButton.vue'
import ExternalLink from './ExternalLink.vue'

export type LandingGuide = 'userscript' | 'bookmarklet'

const guide = defineModel<LandingGuide | undefined>('guide', { required: true })
</script>

<template>
  <AppModal
    :open="!!guide"
    :title="guide && $t(`guide.${guide}.title`)"
    padding="medium"
    @update:open="guide = undefined"
  >
    <div v-if="guide" class="flex flex-col gap-4 text-sm">
      <p class="leading-relaxed">
        {{ $t(`guide.${guide}.intro`) }}
      </p>

      <ol class="flex flex-col list-decimal gap-3 pl-5">
        <template v-if="guide === 'userscript'">
          <i18n-t keypath="guide.userscript.manager" tag="li" scope="global">
            <template #tampermonkey>
              <ExternalLink href="https://www.tampermonkey.net/">
                Tampermonkey
              </ExternalLink>
            </template>
            <template #violentmonkey>
              <ExternalLink href="https://violentmonkey.github.io/">
                Violentmonkey
              </ExternalLink>
            </template>
          </i18n-t>
          <li>
            {{ $t('guide.userscript.install') }}
            <div class="mt-2 flex">
              <ActionButton href="https://diffwise.shyim.de/pulls-review-github.user.js" icon="i-ph:download-duotone">
                {{ $t('landing.installUserscript') }}
              </ActionButton>
            </div>
          </li>
          <i18n-t keypath="guide.userscript.open" tag="li" scope="global">
            <template #tab>
              <strong class="color-base">{{ $t('embed.reviewChanges') }}</strong>
            </template>
          </i18n-t>
          <li>{{ $t('guide.userscript.ai') }}</li>
        </template>

        <template v-else-if="guide === 'bookmarklet'">
          <i18n-t keypath="guide.bookmarklet.bar" tag="li" scope="global">
            <template #shortcut>
              <kbd class="rounded bg-code px-1 text-[0.85em] font-mono">Ctrl/⌘ + Shift + B</kbd>
            </template>
          </i18n-t>
          <li>
            {{ $t('guide.bookmarklet.drag') }}
            <div class="mt-2 flex">
              <BookmarkletButton />
            </div>
          </li>
          <li>{{ $t('guide.bookmarklet.use') }}</li>
        </template>
      </ol>
    </div>
  </AppModal>
</template>
