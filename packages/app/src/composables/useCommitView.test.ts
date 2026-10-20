import type { DiffSource, DiffsPayload } from '@pulls.review/core/types'
import { createCacheRepositories } from '@pulls.review/core/cache'
import { mount } from '@vue/test-utils'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createFixedResolver, experimental_createRouter, MatcherPatternPathStatic, MatcherPatternQueryParam, normalizeRouteRecord } from 'vue-router/experimental'
import { createDiffsStore } from '../stores/diffs-store'
import { useCommitView } from './useCommitView'

const COMMITS = [{ sha: 'aaa', message: 'one' }, { sha: 'bbb', message: 'two' }]

function source(payload: Omit<DiffsPayload, 'files'>): DiffSource {
  return { key: async () => JSON.stringify(payload.ref), fetch: async () => ({ ...payload, files: [] }) }
}

const parentPayload: Omit<DiffsPayload, 'files'> = { ref: { kind: 'paste', hash: 'parent' }, title: 'parent', commits: COMMITS }

const scrollTo = vi.fn()
beforeEach(() => vi.stubGlobal('scrollTo', scrollTo))
afterEach(() => {
  vi.unstubAllGlobals()
  scrollTo.mockReset()
})

async function setup(path: string, commits: DiffsPayload['commits'] = COMMITS) {
  const cache = createCacheRepositories(createStorage({ driver: memoryDriver() }))
  const fetched: string[] = []
  let view!: ReturnType<typeof useCommitView>
  const Page = defineComponent({
    setup() {
      const parent = createDiffsStore(source({ ...parentPayload, commits }), { cache })
      view = useCommitView(parent, (sha) => {
        fetched.push(sha)
        return source({ ref: { kind: 'paste', hash: sha }, title: `commit ${sha}` })
      }, { cache })
      parent.load()
      return () => h('div')
    },
  })
  const router = experimental_createRouter({
    history: createMemoryHistory(),
    resolver: createFixedResolver([
      normalizeRouteRecord({
        name: 'diff',
        path: new MatcherPatternPathStatic('/diff'),
        query: [
          new MatcherPatternQueryParam('commit', 'commit', 'value'),
          new MatcherPatternQueryParam('from', 'from', 'value'),
        ],
        components: { default: Page },
      }),
    ]),
  })
  await router.push(path)
  mount(Page, { global: { plugins: [router] } })
  await vi.waitFor(() => expect(view.store.value.diff).toBeDefined())
  return { view, router, fetched }
}

describe('useCommitView', () => {
  it('shows the whole diff and lists its commits when no commit is selected', async () => {
    const { view } = await setup('/diff')

    expect(view.store.value.diff?.title).toBe('parent')
    expect(view.commitNav.value).toMatchObject({ commits: COMMITS, selected: undefined })
  })

  it('offers no navigation for a diff with a single commit', async () => {
    const { view } = await setup('/diff', [COMMITS[0]!])
    expect(view.commitNav.value).toBeUndefined()
  })

  it('opens the commit named by ?commit= as its own diff and returns to the parent on back', async () => {
    const { view, router, fetched } = await setup('/diff?commit=bbb')

    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('commit bbb'))
    expect(view.commitNav.value?.selected).toBe('bbb')
    expect(fetched).toEqual(['bbb'])

    view.commitNav.value!.select()
    await nextTick()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/diff'))
    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('parent'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('selecting a commit pushes it onto the history as a query', async () => {
    const { view, router } = await setup('/diff')

    view.commitNav.value!.select('aaa')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/diff?commit=aaa'))
    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('commit aaa'))

    router.back()
    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('parent'))
  })

  it('keeps other query values and the file hash when selecting and clearing a commit', async () => {
    const { view, router } = await setup('/diff?from=landing&filter=a&filter=b#file')

    view.commitNav.value!.select('aaa')
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/diff?from=landing&filter=a&filter=b&commit=aaa#file'))
    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('commit aaa'))

    view.commitNav.value!.select()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/diff?from=landing&filter=a&filter=b#file'))
    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('parent'))
  })

  it('uses the last value when the commit query has multiple values', async () => {
    const { view } = await setup('/diff?commit=aaa&commit=bbb')

    await vi.waitFor(() => expect(view.store.value.diff?.title).toBe('commit bbb'))
    expect(view.selected.value).toBe('bbb')
  })

  it('shows the whole diff when the commit query has no value', async () => {
    const { view } = await setup('/diff?commit')
    expect(view.store.value.diff?.title).toBe('parent')
    expect(view.selected.value).toBeUndefined()
  })
})
