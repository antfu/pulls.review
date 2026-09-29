<script setup lang="ts">
import type { Timeline } from 'animejs'
import DisplayDonut from '@antfu/design/components/Display/DisplayDonut.vue'
import DisplayFileIcon from '@antfu/design/components/Display/DisplayFileIcon.vue'
import { useDebounceFn, useIntersectionObserver, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { createTimeline, stagger } from 'animejs'
import { computed, onBeforeUnmount, onMounted, reactive, useTemplateRef, watch } from 'vue'
import DiffStats from '../diff/DiffStats.vue'
import PrStatusIcon from '../diff/PrStatusIcon.vue'
import { DEMO_FILES, DEMO_GROUPS, DEMO_PR } from './demo-data'
import { buildSchedule, findBeat } from './demo-schedule'

const props = defineProps<{
  /** Skip the loop and show the settled end state (everything grouped and reviewed). */
  still?: boolean
}>()

const reducedMotion = usePreferredReducedMotion()
const settled = computed(() => props.still || reducedMotion.value === 'reduce')

const root = useTemplateRef('root')
const body = useTemplateRef('body')

const progress = DEMO_GROUPS.map(() => reactive({ value: 0 }))

function splitPath(path: string) {
  const idx = path.lastIndexOf('/')
  return { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) }
}

const files = DEMO_FILES.map(file => ({ ...file, ...splitPath(file.path) }))
const hiddenFiles = DEMO_PR.files - DEMO_FILES.length
const groups = DEMO_GROUPS.map((group, i) => {
  const shown = files.filter(file => file.group === i)
  return { ...group, shown: group.expanded ? shown : [], hidden: group.files - shown.length }
})

let timeline: Timeline | undefined
let visible = false

function query(selector: string): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>(selector) ?? [])
}

function build() {
  if (!root.value || !body.value)
    return
  const beats = buildSchedule(DEMO_GROUPS.length)
  const morph = findBeat(beats, 'morph')
  const reset = findBeat(beats, 'reset')

  const rows = query('[data-row]')
  const cards = query('[data-card]')
  const details = query('[data-detail]')
  const donuts = query('[data-donut]')
  const checks = query('[data-check]')
  const [total] = query('[data-total]')
  const [summary] = query('[data-summary]')
  const [tail] = query('[data-tail]')
  const [groupedLayer] = query('[data-grouped]')

  const tl = createTimeline({ loop: true, autoplay: false, defaults: { ease: 'inOutQuad' } })

  tl.add(body.value, { opacity: [0, 1], duration: 400 }, 0)

  // The PR-wide total is the scary number; the AI summary takes its place.
  if (total)
    tl.add(total, { opacity: 0, duration: 400 }, morph.at)
  if (summary)
    tl.add(summary, { opacity: [0, 1], duration: 400 }, morph.at + 300)
  if (tail)
    tl.add(tail, { opacity: 0, duration: 300 }, morph.at)

  const cardsAt = morph.at + morph.duration * 0.3
  if (groupedLayer)
    tl.set(groupedLayer, { opacity: 1 }, cardsAt)
  tl.add(cards, { opacity: [0, 1], y: [12, 0], duration: 500, delay: stagger(60) }, cardsAt)

  // Rows of an expanded group fly to their own slot in that group and hand
  // over to the grouped copy; the rest fade out where they are.
  const flight = morph.duration * 0.55
  rows.forEach((row, i) => {
    const file = files[i]!
    const from = row.getBoundingClientRect()
    const at = morph.at + i * 30
    const slot = root.value!.querySelector<HTMLElement>(`[data-target="${file.path}"]`)
    if (slot) {
      const to = slot.getBoundingClientRect()
      tl.add(row, { x: to.left - from.left, y: to.top - from.top, duration: flight, ease: 'inOutCubic' }, at)
      tl.set(row, { opacity: 0 }, at + flight)
      tl.set(slot, { opacity: 1 }, at + flight)
    }
    else {
      tl.add(row, { opacity: 0, duration: flight * 0.6 }, at)
    }
  })

  tl.add(details, { opacity: [0, 1], duration: 300, delay: stagger(60) }, morph.at + flight)

  DEMO_GROUPS.forEach((_, i) => {
    const beat = findBeat(beats, `review-${i}`)
    const fill = beat.duration * 0.7
    tl.add(progress[i]!, { value: 1, duration: fill }, beat.at)
    tl.add(donuts[i]!, { opacity: 0, duration: 150 }, beat.at + fill)
    tl.add(checks[i]!, { opacity: [0, 1], scale: [0, 1], duration: 300, ease: 'outBack' }, beat.at + fill)
  })

  tl.add(body.value, { opacity: 0, duration: reset.duration }, reset.at)

  timeline = tl
  if (visible)
    tl.play()
}

function teardown() {
  timeline?.revert()
  timeline = undefined
}

function rebuild() {
  teardown()
  if (!settled.value)
    build()
}

// Row targets are measured once per build, so a width change needs new numbers.
let width = 0

onMounted(() => {
  width = root.value?.clientWidth ?? 0
  rebuild()
})
onBeforeUnmount(teardown)
watch(settled, rebuild)

useResizeObserver(root, useDebounceFn(([entry]) => {
  const next = entry?.contentRect.width ?? 0
  if (next === width)
    return
  width = next
  rebuild()
}, 200))

useIntersectionObserver(root, ([entry]) => {
  visible = entry?.isIntersecting ?? false
  if (visible)
    timeline?.play()
  else
    timeline?.pause()
})
</script>

<template>
  <div ref="root" class="text-xs p4 rounded-lg select-none lt-md:border lt-md:border-base" aria-hidden="true">
    <h2 class="text-xs font-mono mb2 op-fade">
      // demo
    </h2>

    <div class="flex gap-2 items-start">
      <PrStatusIcon state="open" class="mt-0.5" />
      <div class="flex-1 min-w-0">
        <div class="flex gap-3 items-start">
          <div class="text-sm leading-snug font-medium flex-1 min-w-0">
            {{ DEMO_PR.title }} <span class="op-fade">#{{ DEMO_PR.number }}</span>
          </div>
        </div>
        <div class="mt-1.5 grid grid-cols-1">
          <span data-total class="flex gap-2 col-start-1 row-start-1 items-center self-start" :class="{ 'op-0': settled }">
            <DiffStats :additions="DEMO_PR.additions" :deletions="DEMO_PR.deletions" />
            <span class="op-fade whitespace-nowrap">{{ DEMO_PR.files }} files</span>
          </span>
          <span data-summary class="flex gap-1.5 col-start-1 row-start-1 items-start" :class="{ 'op-0': !settled }">
            <span class="i-ph-sparkle-duotone color-accent-magenta mt-0.5 shrink-0" />
            <span class="op-fade">{{ DEMO_PR.summary }}</span>
          </span>
        </div>
      </div>
    </div>

    <div ref="body" class="mt-4 pl-6 grid grid-cols-1">
      <ul class="mt--5 pl2 flex flex-col col-start-1 row-start-1" :class="{ 'op-0': settled }">
        <li
          v-for="file in files"
          :key="file.path"
          data-row
          class="flex gap-1 h-6 origin-left items-center"
        >
          <DisplayFileIcon :path="file.path" class="shrink-0" />
          <span class="min-w-0 truncate"><span class="op-fade">{{ file.dir }}</span>{{ file.base }}</span>
        </li>
        <li data-tail class="op-fade flex h-8 items-center">
          ... {{ hiddenFiles }} more files
        </li>
      </ul>

      <div data-grouped class="flex flex-col gap-2 col-start-1 row-start-1" :class="{ 'op-0': !settled }">
        <div v-for="(group, i) in groups" :key="group.label" class="flex flex-col">
          <div data-card class="ml--5 py-1 flex gap-2 items-center" :class="{ 'op-0': !settled }">
            <span class="op-fade shrink-0" :class="group.expanded ? 'i-ph-caret-down-bold' : 'i-ph-caret-right-bold'" />
            <span data-label class="text-sm font-medium min-w-0 truncate">{{ group.label }}</span>
            <span class="flex-1" />
            <DiffStats :additions="group.additions" :deletions="group.deletions" />
            <span class="op-fade whitespace-nowrap">{{ group.files }} files</span>
            <span class="color-accent-teal shrink-0 grid size-4 place-items-center">
              <span data-donut class="flex col-start-1 row-start-1" :class="{ 'op-0': settled }">
                <DisplayDonut :value="settled ? 1 : progress[i]!.value" :size="14" :thickness="2.5" color="currentColor" />
              </span>
              <span data-check class="i-ph-check-circle-duotone text-base m--0.5 col-start-1 row-start-1" :class="{ 'op-0': !settled }" />
            </span>
          </div>
          <ul v-if="group.shown.length" class="pl-5 flex flex-col">
            <li
              v-for="file in group.shown"
              :key="file.path"
              :data-target="file.path"
              class="flex gap-1 h-6 items-center"
              :class="{ 'op-0': !settled }"
            >
              <DisplayFileIcon :path="file.path" class="shrink-0" />
              <span class="min-w-0 truncate"><span class="op-fade">{{ file.dir }}</span>{{ file.base }}</span>
            </li>
            <li v-if="group.hidden" data-detail class="flex h-6 items-center" :class="{ 'op-0': !settled }">
              <span class="op-fade">... {{ group.hidden }} more files</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
