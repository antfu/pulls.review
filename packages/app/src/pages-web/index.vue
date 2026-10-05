<script setup lang="ts">
import type { LandingGuide } from '../components/landing/LandingGuideModal.vue'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppFooter from '../components/AppFooter.vue'
import AppHeader from '../components/AppHeader.vue'
import DiffPill from '../components/DiffPill.vue'
import BookmarkletButton from '../components/landing/BookmarkletButton.vue'
import ExternalLink from '../components/landing/ExternalLink.vue'
import LandingDemo from '../components/landing/LandingDemo.vue'
import LandingGuideModal from '../components/landing/LandingGuideModal.vue'
import LandingHero from '../components/landing/LandingHero.vue'
import LoadDiffModal from '../components/load/LoadDiffModal.vue'
import RepositoryPill from '../components/RepositoryPill.vue'
import { UPLOAD_SESSION_STORAGE_KEY } from '../composables/uploadSession'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { useRecentDiffs } from '../composables/useRecentDiffs'
import { useRecentRepositories } from '../composables/useRecentRepositories'
import { formatTimeAgo } from '../i18n/time-ago'
import { routeForRef, routeFromGithubUrl } from '../source-routes'

const DEMO_PRS = [
  { owner: 'antfu', repo: 'pulls.review', number: 45, state: 'merged', title: 'feat: review any GitHub compare range or single commit' },
  { owner: 'antfu', repo: 'pulls.review', number: 46, state: 'merged', title: 'feat(app): sidebar tree mode for the group list' },
] as const

// Auto-load the AI analysis shared by the GitHub Actions bot.
const DEMO_FROM = 'github-actions[bot]'

const router = useRouter()
const { locale, t } = useI18n()
const url = ref('')
const loadDiffOpen = ref(false)
const guide = ref<LandingGuide>()

const parsed = computed(() => routeFromGithubUrl(url.value))

function go() {
  if (parsed.value)
    router.push(parsed.value)
}

async function loadFile(file: File) {
  const text = await file.text()
  sessionStorage.setItem(UPLOAD_SESSION_STORAGE_KEY, JSON.stringify({ text, title: file.name }))
  router.push('/upload')
}

// Counts nested `dragenter`/`dragleave` pairs (they fire for every child element
// the pointer crosses too) so the drop overlay doesn't flicker while dragging
// across the page's own content.
let dragDepth = 0
const isDragging = ref(false)

function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file)
    loadFile(file)
}

function onDragEnter(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files'))
    return
  dragDepth++
  isDragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0)
    isDragging.value = false
}

const { recent, load } = useRecentDiffs()
const { recent: recentRepos, load: loadRepos } = useRecentRepositories()
onMounted(() => {
  load()
  loadRepos()
})

useDocumentTitle(() => t('landing.documentTitle'), ' - ')
</script>

<template>
  <div
    class="relative min-h-screen flex flex-col"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <AppHeader />

    <div
      v-if="isDragging"
      class="pointer-events-none fixed inset-4 z-toast flex items-center justify-center border-4 border-accent-teal-400 rounded-2xl border-dashed bg-accent-teal-400/10 text-lg color-accent-teal font-medium backdrop-blur-sm"
    >
      {{ $t('landing.dropHint') }}
    </div>

    <main class="mxa max-w-6xl w-full flex flex-1 flex-col gap-20 px-6 py-16 sm:py-20">
      <section class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div class="flex flex-col gap-8">
          <LandingHero />
          <p class="max-w-md text-sm leading-relaxed op-fade">
            {{ $t('landing.tagline') }}
          </p>
          <div class="max-w-md flex flex-col gap-2">
            <form class="flex items-stretch gap-2" @submit.prevent="go">
              <FormTextInput v-model="url" icon="i-ph:link-simple-duotone" placeholder="https://github.com/owner/repo/pull/123" class="flex-1" />
              <ActionButton
                type="submit"
                variant="primary"
                class="pl-3 pr-4"
                icon="i-ph-arrow-right-bold"
                :disabled="!parsed"
              >
                {{ $t('landing.open') }}
              </ActionButton>
            </form>
            <p class="text-xs op-fade">
              {{ $t('landing.pasteHint') }}
            </p>
          </div>
        </div>

        <LandingDemo class="min-w-0 w-full" />
      </section>

      <section v-if="recent.length" class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('landing.recentlyViewed') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <DiffPill
            v-for="item in recent"
            :key="item.route"
            :to="item.route"
            :parent="item.parent"
            :label="item.label"
            :state="item.state"
            :title="item.title"
          >
            <span class="flex color-accent-teal">
              <DisplayDonut :value="item.totalFiles ? item.reviewedCount / item.totalFiles : 0" :size="14" :thickness="2.5" color="currentColor" />
            </span>
            <span class="text-xs op-fade">{{ formatTimeAgo(new Date(item.lastViewedAt), locale) }}</span>
          </DiffPill>
        </div>
      </section>

      <section v-if="recentRepos.length" class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('landing.recentRepositories') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <RepositoryPill
            v-for="item in recentRepos"
            :key="`${item.owner}/${item.repo}`"
            :owner="item.owner"
            :repo="item.repo"
          >
            <span class="text-xs op-fade">{{ $t('pulls.open', { n: item.openCount }) }}</span>
            <span class="text-xs op-fade">{{ formatTimeAgo(new Date(item.lastViewedAt), locale) }}</span>
          </RepositoryPill>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          {{ $t('landing.tryDemos') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <DiffPill
            v-for="pr in DEMO_PRS"
            :key="`${pr.owner}/${pr.repo}#${pr.number}`"
            :to="`${routeForRef({ kind: 'github-pr', owner: pr.owner, repo: pr.repo, number: String(pr.number) })}?from=${encodeURIComponent(DEMO_FROM)}`"
            :parent="`${pr.owner}/${pr.repo}`"
            :label="`#${pr.number}`"
            :state="pr.state"
            :title="pr.title"
          >
            <span class="max-w-56 truncate text-xs op-fade">{{ pr.title }}</span>
          </DiffPill>
        </div>
      </section>

      <section class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-4 border border-base rounded-lg p-5">
          <div class="flex items-start gap-3">
            <span class="i-ph:upload-simple-duotone mt-0.5 shrink-0 text-xl color-accent-teal" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                {{ $t('landing.uploadTitle') }}
              </h2>
              <i18n-t keypath="landing.uploadDescription" tag="p" class="text-sm op-fade" scope="global">
                <template #diff>
                  <code class="rounded bg-code px-1">.diff</code>
                </template>
                <template #patch>
                  <code class="rounded bg-code px-1">.patch</code>
                </template>
              </i18n-t>
            </div>
          </div>
          <div class="mt-auto flex">
            <ActionButton icon="i-ph:upload-simple-duotone" @click="loadDiffOpen = true">
              {{ $t('landing.uploadButton') }}
            </ActionButton>
          </div>
        </div>

        <div class="flex flex-col gap-4 border border-base rounded-lg p-5">
          <div class="flex items-start gap-3">
            <span class="i-ph:puzzle-piece-duotone mt-0.5 shrink-0 text-xl color-accent-magenta" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                {{ $t('landing.embedTitle') }}
              </h2>
              <i18n-t keypath="landing.embedDescription" tag="p" class="text-sm op-fade" scope="global">
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
            </div>
          </div>
          <div class="mt-auto flex gap-2">
            <ActionButton href="https://pulls.review/pulls-review-github.user.js" icon="i-ph:download-duotone">
              {{ $t('landing.installUserscript') }}
            </ActionButton>
            <ActionButton icon="i-ph:book-open-duotone" @click="guide = 'userscript'">
              {{ $t('landing.viewGuide') }}
            </ActionButton>
          </div>
        </div>

        <div class="flex flex-col gap-4 border border-base rounded-lg p-5">
          <div class="flex items-start gap-3">
            <span class="i-ph:bookmark-simple-duotone mt-0.5 shrink-0 text-xl color-accent-magenta" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                {{ $t('landing.bookmarkletTitle') }}
              </h2>
              <p class="text-sm op-fade">
                {{ $t('landing.bookmarkletDescription') }}
              </p>
            </div>
          </div>
          <div class="mt-auto flex gap-2">
            <BookmarkletButton />
            <ActionButton icon="i-ph:book-open-duotone" @click="guide = 'bookmarklet'">
              {{ $t('landing.viewGuide') }}
            </ActionButton>
          </div>
        </div>

        <div class="flex flex-col gap-4 border border-base rounded-lg p-5">
          <div class="flex items-start gap-3">
            <span class="i-ph:lightning-duotone mt-0.5 shrink-0 text-xl color-accent-orange" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                {{ $t('landing.actionsTitle') }}
              </h2>
              <p class="text-sm op-fade">
                {{ $t('landing.actionsDescription') }}
              </p>
            </div>
          </div>
          <div class="mt-auto flex">
            <ActionButton icon="i-ph:book-open-duotone" @click="guide = 'actions'">
              {{ $t('landing.viewGuide') }}
            </ActionButton>
          </div>
        </div>

        <div class="flex flex-col gap-4 border border-base rounded-lg p-5">
          <div class="flex items-start gap-3">
            <span class="i-ph:terminal-window-duotone mt-0.5 shrink-0 text-xl color-accent-teal" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                {{ $t('landing.cliTitle') }}
              </h2>
              <p class="text-sm op-fade">
                {{ $t('landing.cliDescription') }}
              </p>
            </div>
          </div>
          <div class="mt-auto flex">
            <ActionButton icon="i-ph:book-open-duotone" @click="guide = 'cli'">
              {{ $t('landing.viewGuide') }}
            </ActionButton>
          </div>
        </div>
      </section>
    </main>

    <AppFooter />

    <LoadDiffModal v-model:open="loadDiffOpen" />
    <LandingGuideModal v-model:guide="guide" />
  </div>
</template>
