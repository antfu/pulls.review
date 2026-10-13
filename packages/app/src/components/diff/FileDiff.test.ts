import type { FileChange } from '@pulls.review/core/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { i18n } from '../../i18n'
import { autoFetchFullFile } from '../../state/auto-fetch-full-file'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import FileDiff from './FileDiff.vue'

vi.mock('@pierre/diffs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pierre/diffs')>()
  class FileDiff {
    render() {}
    cleanUp() {}
    setOptions() {}
    rerender() {}
  }
  return { ...actual, FileDiff, VirtualizedFileDiff: FileDiff }
})

const file: FileChange = {
  path: 'a.ts',
  status: 'modified',
  additions: 1,
  deletions: 1,
  isBinary: false,
  sha: 'sha',
  hunks: [{
    header: '@@ -3,2 +3,2 @@',
    oldStart: 3,
    oldLines: 2,
    newStart: 3,
    newLines: 2,
    patch: ' const a = 1\n-const b = 2\n+const b = 3',
  }],
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '600px 0px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]
  static instances: TestIntersectionObserver[] = []
  constructor(private callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this)
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }

  intersect(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this)
  }
}

let wrapper: ReturnType<typeof mount> | undefined
let previousAutoFetch: boolean

beforeEach(() => {
  previousAutoFetch = autoFetchFullFile.value
  TestIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
})

afterEach(() => {
  wrapper?.unmount()
  autoFetchFullFile.value = previousAutoFetch
  vi.unstubAllGlobals()
})

async function mountDiff(autoFetch: boolean) {
  autoFetchFullFile.value = autoFetch
  const store = createMockDiffsStore({ fileContent: { old: 'a\nb\nconst a = 1\nconst b = 2', new: 'a\nb\nconst a = 1\nconst b = 3' } })
  const load = vi.spyOn(store.fileContent!, 'load')
  wrapper = mount(FileDiff, { props: { store, file }, global: { plugins: [i18n] } })
  await nextTick()
  return load
}

async function intersect(isIntersecting = true) {
  for (const observer of TestIntersectionObserver.instances)
    observer.intersect(isIntersecting)
  await flushPromises()
}

describe('automatic full-file fetching', () => {
  it('fetches a full file only when it nears the viewport', async () => {
    const load = await mountDiff(true)
    await intersect(false)
    expect(load).not.toHaveBeenCalled()
    await intersect()
    expect(load).toHaveBeenCalledTimes(1)
    expect(wrapper!.find('[aria-label="Load full file content"]').exists()).toBe(false)
  })

  it('does not fetch automatically when disabled, but allows a manual load', async () => {
    const load = await mountDiff(false)
    await intersect()
    expect(load).not.toHaveBeenCalled()
    await wrapper!.get('[aria-label="Load full file content"]').trigger('click')
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
    expect(wrapper!.find('[aria-label="Load full file content"]').exists()).toBe(false)
  })

  it('fetches a visible file when automatic fetching is enabled', async () => {
    const load = await mountDiff(false)
    await intersect()
    autoFetchFullFile.value = true
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('collapsing on review', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function markReviewedWithMarkerAt(top: number) {
    const marker = document.createElement('div')
    marker.dataset.fileStart = file.sha
    marker.getBoundingClientRect = () => ({ top }) as DOMRect
    marker.scrollIntoView = vi.fn()
    document.body.append(marker)
    const store = createMockDiffsStore({})
    wrapper = mount(FileDiff, { props: { store, file }, global: { plugins: [i18n] }, attachTo: document.body })
    await nextTick()
    await store.setReviewed([file.sha], true)
    await flushPromises()
    return marker
  }

  it('pins a file scrolled past its start back to the top', async () => {
    const marker = await markReviewedWithMarkerAt(-2000)
    expect(marker.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  })

  it('leaves the scroll alone when the file starts in view', async () => {
    const marker = await markReviewedWithMarkerAt(300)
    expect(marker.scrollIntoView).not.toHaveBeenCalled()
  })
})
