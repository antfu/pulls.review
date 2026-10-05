<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import AppModal from '../AppModal.vue'

export type LandingGuide = 'userscript' | 'actions' | 'cli'

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
</script>

<template>
  <AppModal
    :open="!!guide"
    :title="guide && $t(`guide.${guide}.title`)"
    @update:open="guide = undefined"
  >
    <ol v-if="guide === 'userscript'" class="guide-steps">
      <i18n-t keypath="guide.userscript.manager" tag="li" scope="global">
        <template #tampermonkey>
          <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener" class="color-base hover:underline">Tampermonkey</a>
        </template>
        <template #violentmonkey>
          <a href="https://violentmonkey.github.io/" target="_blank" rel="noopener" class="color-base hover:underline">Violentmonkey</a>
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
    </ol>

    <ol v-else-if="guide === 'actions'" class="guide-steps">
      <i18n-t keypath="guide.actions.secret" tag="li" scope="global">
        <template #name>
          <code>VERCEL_AI_GATEWAY_API_KEY</code>
        </template>
      </i18n-t>
      <li>
        {{ $t('guide.actions.workflow') }}
        <pre><code>{{ WORKFLOW }}</code></pre>
      </li>
      <li>{{ $t('guide.actions.result') }}</li>
      <i18n-t keypath="guide.actions.options" tag="li" scope="global">
        <template #provider>
          <code>provider</code>
        </template>
        <template #model>
          <code>model</code>
        </template>
        <template #locale>
          <code>locale</code>
        </template>
        <template #readme>
          <a href="https://github.com/antfu/pulls.review#analyze-pull-requests-from-ci-experimental" target="_blank" rel="noopener" class="color-base hover:underline">README</a>
        </template>
      </i18n-t>
    </ol>

    <div v-else-if="guide === 'cli'" class="flex flex-col gap-3">
      <p class="flex items-center gap-2 border border-base rounded-md px-3 py-2 text-sm op-fade">
        <span class="i-ph:hourglass-medium-duotone shrink-0" aria-hidden="true" />
        {{ $t('guide.cli.soon') }}
      </p>
      <ol class="guide-steps">
        <li>
          {{ $t('guide.cli.workingTree') }}
          <pre><code>npx pulls.review</code></pre>
        </li>
        <li>
          {{ $t('guide.cli.target') }}
          <pre><code>npx pulls.review HEAD~1     # one commit
npx pulls.review main...HEAD # what this branch adds</code></pre>
        </li>
        <li>
          <i18n-t keypath="guide.cli.pr" tag="span" scope="global">
            <template #pkg>
              <code>@pulls.review/actions</code>
            </template>
          </i18n-t>
          <pre><code>GITHUB_TOKEN=... ANTHROPIC_API_KEY=... npx @pulls.review/actions owner/repo#123</code></pre>
        </li>
      </ol>
    </div>
  </AppModal>
</template>

<style scoped>
.guide-steps {
  @apply flex flex-col gap-3 pl-5 text-sm list-decimal;
}
.guide-steps :deep(:not(pre) > code) {
  @apply text-[0.85em] px-1 py-0.5 rounded bg-code;
}
.guide-steps :deep(pre) {
  @apply mt-2 text-xs leading-relaxed p-3 border border-base rounded-md bg-code max-w-full overflow-x-auto;
}
</style>
