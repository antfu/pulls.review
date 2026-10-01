<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { PullRequestListStore } from '../../stores/pull-request-list-store'
import type { PullRequestSort } from './pull-request-list-query'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { useElementBounding } from '@vueuse/core'
import { computed, useTemplateRef, watch } from 'vue'
import { filterPullRequests, sortPullRequests } from './pull-request-list-query'
import PullRequestRow from './PullRequestRow.vue'

const props = defineProps<{
  store: PullRequestListStore
  query: string
  sort: PullRequestSort
}>()

const rows = computed(() => sortPullRequests(filterPullRequests(props.store.items, props.query), props.sort))

// Window-scrolled: rows measure themselves (labels wrap, titles run long), so the
// estimate only seeds the first layout.
const listRef = useTemplateRef<HTMLElement>('list')
const { top } = useElementBounding(listRef)
const virtualizer = useWindowVirtualizer(computed(() => ({
  count: rows.value.length,
  estimateSize: () => 68,
  overscan: 10,
  scrollMargin: top.value + window.scrollY,
})))
const virtualRows = computed(() => virtualizer.value.getVirtualItems())

function measure(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement)
    virtualizer.value.measureElement(el)
}

// Fetch the next page as soon as the tail comes into (over)scan range - which also
// covers a first page too short to scroll.
watch(() => virtualRows.value.at(-1)?.index, (last) => {
  if (last !== undefined && last >= rows.value.length - 10)
    props.store.loadMore()
})
</script>

<template>
  <div ref="list" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
    <div
      v-for="row in virtualRows"
      :key="rows[row.index]!.number"
      :ref="measure"
      :data-index="row.index"
      class="absolute left-0 top-0 w-full"
      :style="{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }"
    >
      <PullRequestRow :owner="store.owner" :repo="store.repo" :pr="rows[row.index]!" :viewed="store.viewed.get(rows[row.index]!.number)" />
    </div>
  </div>
</template>
