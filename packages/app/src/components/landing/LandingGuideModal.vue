<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import AppModal from '../AppModal.vue'
import BookmarkletButton from './BookmarkletButton.vue'
import ExternalLink from './ExternalLink.vue'
import GuideCode from './GuideCode.vue'

export type LandingGuide = 'userscript' | 'bookmarklet' | 'actions' | 'cli'

const guide = defineModel<LandingGuide | undefined>('guide', { required: true })

const WORKFLOW = `# .github/workflows/pulls-review.yml
name: pulls.review
on:
  # Only reads the diff through the API and never checks out PR code,
  # so \`pull_request_target\` is safe and fork PRs get a comment too.
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: antfu/pulls.review@main
        with:
          api-key: \${{ secrets.VERCEL_AI_GATEWAY_API_KEY }}`

const CLI_TARGETS = `npx pulls.review main...feat # what feat adds since it forked from main
npx pulls.review HEAD        # the last commit
npx pulls.review --worktree  # uncommitted changes, new files included`
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
              <ActionButton href="https://pulls.review/pulls-review-github.user.js" icon="i-ph:download-duotone">
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

        <template v-else-if="guide === 'actions'">
          <i18n-t keypath="guide.actions.secret" tag="li" scope="global">
            <template #name>
              <code class="rounded bg-code px-1 text-[0.85em]">VERCEL_AI_GATEWAY_API_KEY</code>
            </template>
          </i18n-t>
          <li>
            {{ $t('guide.actions.workflow') }}
            <GuideCode :code="WORKFLOW" lang="yaml" />
          </li>
          <li>{{ $t('guide.actions.result') }}</li>
          <i18n-t keypath="guide.actions.options" tag="li" scope="global">
            <template #provider>
              <code class="rounded bg-code px-1 text-[0.85em]">provider</code>
            </template>
            <template #model>
              <code class="rounded bg-code px-1 text-[0.85em]">model</code>
            </template>
            <template #locale>
              <code class="rounded bg-code px-1 text-[0.85em]">locale</code>
            </template>
            <template #readme>
              <ExternalLink href="https://github.com/antfu/pulls.review#analyze-pull-requests-from-ci-experimental">
                README
              </ExternalLink>
            </template>
          </i18n-t>
        </template>

        <template v-else-if="guide === 'cli'">
          <li>
            {{ $t('guide.cli.branch') }}
            <GuideCode code="npx pulls.review" lang="shellscript" />
          </li>
          <li>
            {{ $t('guide.cli.target') }}
            <GuideCode :code="CLI_TARGETS" lang="shellscript" />
          </li>
          <i18n-t keypath="guide.cli.browser" tag="li" scope="global">
            <template #url>
              <code class="rounded bg-code px-1 text-[0.85em]">http://localhost:&lt;port&gt;/</code>
            </template>
          </i18n-t>
        </template>
      </ol>
    </div>
  </AppModal>
</template>
