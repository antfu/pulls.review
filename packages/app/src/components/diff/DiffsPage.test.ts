import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import { shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import { i18n } from '../../i18n'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffsPage from './DiffsPage.vue'

const setup = vi.fn()

// happy-dom's `document` is not an `instanceof Document`, unlike a browser's.
vi.stubGlobal('Document', document.constructor)

vi.mock('@pierre/diffs', async importOriginal => ({
  ...await importOriginal<typeof import('@pierre/diffs')>(),
  Virtualizer: class {
    setup = setup
    cleanUp() {}
  },
}))

const wrappers: ReturnType<typeof shallowMount>[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  setup.mockClear()
})

function mountPage(embedded: boolean) {
  const store = createMockDiffsStore({ diff: partiallyReviewed.diff as DiffsPayload, grouped: partiallyReviewed.grouped as GroupedResult })
  const host = document.createElement('div')
  document.body.append(host)
  const container = document.createElement('div')
  ;(embedded ? host.attachShadow({ mode: 'open' }) : host).append(container)
  // The embed passes `document` from a template ref that is still unset when this mounts,
  // so the prop is the window's document in both cases.
  wrappers.push(shallowMount(DiffsPage, { props: { store, document }, global: { plugins: [i18n] }, attachTo: container }))
}

describe('diffsPage virtualizer root', () => {
  it('watches its own scroller inside a shadow root', () => {
    mountPage(true)
    const root = setup.mock.calls[0]![0] as HTMLElement
    expect(root).toBeInstanceOf(HTMLElement)
    expect(root.getRootNode()).toBeInstanceOf(ShadowRoot)
  })

  it('watches the window on the site', () => {
    mountPage(false)
    expect(setup).toHaveBeenCalledWith(document)
  })
})
