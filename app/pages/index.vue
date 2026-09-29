<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { formatTimeAgo } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import LandingDemo from '../components/landing/LandingDemo.vue'
import LoadDiffModal from '../components/load/LoadDiffModal.vue'
import PullRequestPill from '../components/PullRequestPill.vue'
import { UPLOAD_SESSION_STORAGE_KEY } from '../composables/uploadSession'
import { useDocumentTitle } from '../composables/useDocumentTitle'
import { useRecentPullRequests } from '../composables/useRecentPullRequests'

const DEMO_PRS = [
  { owner: 'slidevjs', repo: 'slidev', number: 2746, state: 'open', title: 'feat: arrange slides on a grid' },
  { owner: 'slidevjs', repo: 'slidev', number: 2722, state: 'merged', title: 'feat(export): editable PPTX export with native shapes and text' },
  { owner: 'unocss', repo: 'unocss', number: 5296, state: 'merged', title: 'feat: add Rollup and Rolldown integration' },
  { owner: 'antfu', repo: 'pulls.review', number: 9, state: 'merged', title: 'feat: share an AI analysis as a PR comment and load shared results' },
] as const

const router = useRouter()
const url = ref('')
const loadDiffOpen = ref(false)

const parsed = computed(() => {
  const match = url.value.trim().match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match)
    return undefined
  const [, owner, repo, number] = match
  return { owner, repo, number }
})

function go() {
  if (!parsed.value)
    return
  router.push(`/gh/${parsed.value.owner}/${parsed.value.repo}/${parsed.value.number}`)
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

const { recent, load } = useRecentPullRequests()
onMounted(load)

// No subject: resets the tab to the plain app name after returning from a PR/upload view.
useDocumentTitle(() => undefined)
</script>

<template>
  <div
    class="flex flex-col min-h-screen relative"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <AppHeader />

    <div
      v-if="isDragging"
      class="text-lg color-accent-teal font-medium border-4 border-accent-teal-400 rounded-2xl border-dashed bg-accent-teal-400/10 flex pointer-events-none items-center inset-4 justify-center fixed z-toast backdrop-blur-sm"
    >
      Drop to load your diff / .patch file
    </div>

    <main class="mxa px-6 py-16 flex flex-1 flex-col gap-20 max-w-6xl w-full sm:py-20">
      <section class="gap-12 grid items-center lg:gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div class="flex flex-col gap-8">
          <h1 class="text-[clamp(2.25rem,4.6vw,4rem)] leading-[1.05] tracking-tight font-medium font-mono">
            <span class="block"><span class="color-accent-orange" aria-hidden="true">@@</span> pull</span>
            <span class="block">reviews<span class="color-accent-magenta" aria-hidden="true">:</span></span>
            <span class="block"><span class="color-accent-teal" aria-hidden="true">+</span> made<span class="color-accent-orange" aria-hidden="true">{}</span></span>
            <span class="block"><span class="color-accent-magenta" aria-hidden="true">>>> </span>easy<span class="i-ph-check-bold text-[0.8em] color-accent-teal inline-block translate-y-2" aria-hidden="true" /></span>
          </h1>
          <p class="text-sm leading-relaxed op-fade max-w-md">
            Groups changed files, summarizes what matters, review them one scope at a time.
          </p>
          <div class="flex flex-col gap-2 max-w-md">
            <form class="flex gap-2 items-stretch" @submit.prevent="go">
              <FormTextInput v-model="url" icon="i-ph:link-simple-duotone" placeholder="https://github.com/owner/repo/pull/123" class="flex-1" />
              <ActionButton
                type="submit"
                variant="primary"
                class="pl-3 pr-4"
                icon="i-ph-arrow-right-bold"
                :disabled="!parsed"
              >
                Open
              </ActionButton>
            </form>
            <p class="text-xs op-fade">
              Paste any GitHub pull request URL, or pick a demo below.
            </p>
          </div>
        </div>

        <LandingDemo class="min-w-0 w-full" />
      </section>

      <section v-if="recent.length" class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          // recently viewed
        </h2>
        <div class="flex flex-wrap gap-2">
          <PullRequestPill
            v-for="pr in recent"
            :key="`${pr.owner}/${pr.repo}#${pr.number}`"
            :owner="pr.owner"
            :repo="pr.repo"
            :number="pr.number"
            :state="pr.state"
            :title="pr.title"
          >
            <span class="color-accent-teal flex">
              <DisplayDonut :value="pr.totalFiles ? pr.reviewedCount / pr.totalFiles : 0" :size="14" :thickness="2.5" color="currentColor" />
            </span>
            <span class="text-xs op-fade">{{ formatTimeAgo(new Date(pr.lastViewedAt)) }}</span>
          </PullRequestPill>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xs font-mono op-fade">
          // try some demos
        </h2>
        <div class="flex flex-wrap gap-2">
          <PullRequestPill
            v-for="pr in DEMO_PRS"
            :key="`${pr.owner}/${pr.repo}#${pr.number}`"
            :owner="pr.owner"
            :repo="pr.repo"
            :number="pr.number"
            :state="pr.state"
            :title="pr.title"
          >
            <span class="text-xs op-fade max-w-56 truncate">{{ pr.title }}</span>
          </PullRequestPill>
        </div>
      </section>

      <section class="gap-4 grid sm:grid-cols-2">
        <div class="p-5 border border-base rounded-lg flex flex-col gap-4">
          <div class="flex gap-3 items-start">
            <span class="i-ph:upload-simple-duotone text-xl color-accent-teal mt-0.5 shrink-0" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                Review a diff without a PR
              </h2>
              <p class="text-sm op-fade">
                Upload or paste a unified diff, or drop a <code class="px-1 rounded bg-code">.diff</code> / <code class="px-1 rounded bg-code">.patch</code> file anywhere on this page.
              </p>
            </div>
          </div>
          <div class="mt-auto flex">
            <ActionButton icon="i-ph:upload-simple-duotone" @click="loadDiffOpen = true">
              Upload a diff
            </ActionButton>
          </div>
        </div>

        <div class="p-5 border border-base rounded-lg flex flex-col gap-4">
          <div class="flex gap-3 items-start">
            <span class="i-ph:puzzle-piece-duotone text-xl color-accent-magenta mt-0.5 shrink-0" aria-hidden="true" />
            <div class="flex-1">
              <h2 class="font-semibold">
                Use it directly on github.com
              </h2>
              <p class="text-sm op-fade">
                With <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener" class="color-base hover:underline">Tampermonkey</a> or <a href="https://violentmonkey.github.io/" target="_blank" rel="noopener" class="color-base hover:underline">Violentmonkey</a> installed, a pulls.review drawer appears on every pull request page.
              </p>
            </div>
          </div>
          <div class="mt-auto flex">
            <ActionButton href="https://pulls.review/pulls-review-github.user.js" icon="i-ph:download-duotone">
              Install userscript
            </ActionButton>
          </div>
        </div>
      </section>
    </main>

    <footer class="text-xs px-6 py-6 op-fade flex gap-2 items-center justify-center">
      <span>MIT</span>
      <span>·</span>
      <a href="https://github.com/antfu/pulls.review" target="_blank" rel="noopener" class="transition hover:color-base hover:op100">GitHub</a>
    </footer>

    <LoadDiffModal v-model:open="loadDiffOpen" />
  </div>
</template>
