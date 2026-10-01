import type { DiffsPayload } from '@pulls.review/core'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import { i18n } from '../../i18n'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import ReviewProgressModal from './ReviewProgressModal.vue'

// Fixture files: src/a.ts (sha-a), src/b.ts (sha-b), src/c.test.ts (sha-c), README.md (sha-d).
const diff = partiallyReviewed.diff as DiffsPayload
const allShas = diff.files.map(file => file.sha).sort()

// `AppModal` teleports to `body`, so queries go through `document` (each row's
// first button is the checkbox, the second the path) and the
// wrapper is attached (and unmounted after each test) rather than detached.
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => wrapper?.unmount())

function mountModal(input: { reviewed?: string[], changedSinceReviewed?: string[] }) {
  const store = createMockDiffsStore({ diff, ...input })
  wrapper = mount(ReviewProgressModal, {
    props: { open: true, store },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return store
}

function rows() {
  return [...document.body.querySelectorAll('li')].map(li => [li.querySelectorAll('button')[1]!.textContent!.trim(), li.lastElementChild!.textContent!.trim()])
}

async function click(label: string) {
  const button = [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === label)
  button!.click()
  await wrapper!.vm.$nextTick()
}

describe('reviewProgressModal', () => {
  it('lists every file with its status', () => {
    mountModal({ reviewed: ['sha-a'], changedSinceReviewed: ['src/b.ts'] })
    expect(rows()).toEqual([
      ['README.md', 'Not reviewed'],
      ['src/a.ts', 'Reviewed'],
      ['src/b.ts', 'Changed since review'],
      ['src/c.test.ts', 'Not reviewed'],
    ])
  })

  it('inverts, marks all and resets through the store', async () => {
    const store = mountModal({ reviewed: ['sha-a'], changedSinceReviewed: ['src/b.ts'] })

    await click('Invert review state')
    expect([...store.reviewed].sort()).toEqual(['sha-b', 'sha-c', 'sha-d'])
    expect(store.changedSinceReviewed.size).toBe(0)

    await click('Mark all as reviewed')
    expect([...store.reviewed].sort()).toEqual(allShas)

    await click('Reset review state')
    expect(store.reviewed.size).toBe(0)
  })
})
