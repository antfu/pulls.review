import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { mockPendingReview, mockPendingThread } from '../../../test/fixtures/mock-reviews'
import { i18n } from '../../i18n'
import { createMockReviewsStore } from '../../stores/mock-diffs-store'
import ReviewSubmitModal from './ReviewSubmitModal.vue'

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => wrapper?.unmount())

function button(label: string) {
  return [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!
}

function mountModal(authorLogin?: string, viewerLogin = 'octocat') {
  const reviews = createMockReviewsStore({ viewerLogin, pendingReview: mockPendingReview, threads: [mockPendingThread()] })
  wrapper = mount(ReviewSubmitModal, {
    props: { open: true, reviews, authorLogin },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return reviews
}

describe('reviewSubmitModal', () => {
  it.each(['Comment', 'Approve', 'Request changes'])('keeps %s selected after a second click', async (label) => {
    mountModal('someone-else')
    button(label).click()
    await wrapper!.vm.$nextTick()
    expect(button(label).getAttribute('data-state')).toBe('on')
    button(label).click()
    await wrapper!.vm.$nextTick()
    expect(button(label).getAttribute('data-state')).toBe('on')
    expect(document.body.querySelectorAll('[data-state="on"]')).toHaveLength(1)
  })

  it('only allows comments on the viewer’s own PR, regardless of login case', async () => {
    const reviews = mountModal('OctoCat')
    expect(button('Approve').disabled).toBe(true)
    expect(button('Request changes').disabled).toBe(true)
    expect(button('Comment').disabled).toBe(false)
    expect(document.body.textContent).toContain('You cannot approve or request changes on your own pull requests.')

    await new DOMWrapper(document.body.querySelector('textarea')!).setValue('Added a note.')
    button('Submit').click()
    await flushPromises()
    expect(reviews.pendingReview).toBeUndefined()
    expect(reviews.pendingCommentCount).toBe(0)
    expect(wrapper!.emitted('update:open')).toEqual([[false]])
  })

  it.each(['someone-else', undefined])('allows all verdicts when the author is %s', (author) => {
    mountModal(author)
    expect(button('Approve').disabled).toBe(false)
    expect(button('Request changes').disabled).toBe(false)
    expect(document.body.textContent).not.toContain('You cannot approve or request changes on your own pull requests.')
  })

  it('returns to Comment if the viewer is identified as the PR author', async () => {
    const reviews = mountModal('someone-else')
    button('Approve').click()
    await wrapper!.vm.$nextTick()
    expect(button('Approve').getAttribute('data-state')).toBe('on')

    await wrapper!.setProps({ authorLogin: reviews.viewerLogin })
    expect(button('Approve').disabled).toBe(true)
    expect(button('Comment').getAttribute('data-state')).toBe('on')
  })

  describe('on a source without pending reviews or change requests', () => {
    function mountLimited(approver = 'octocat') {
      const reviews = createMockReviewsStore({
        viewerLogin: 'octocat',
        summaries: [{ id: -1, author: { login: approver }, state: 'approved', body: '' }],
        supports: { pendingReview: false, requestChanges: false },
        canRevokeApproval: true,
      })
      wrapper = mount(ReviewSubmitModal, {
        props: { open: true, reviews, authorLogin: 'someone-else' },
        global: { plugins: [i18n] },
        attachTo: document.body,
      })
      return reviews
    }

    it('offers Comment and Approve only', () => {
      mountLimited()
      expect(button('Comment')).toBeDefined()
      expect(button('Approve')).toBeDefined()
      expect(button('Request changes')).toBeUndefined()
    })

    it('lets the viewer revoke an approval they gave', async () => {
      const reviews = mountLimited()
      button('Revoke approval').click()
      await flushPromises()
      expect(reviews.summaries).toEqual([])
    })

    it('offers nothing to revoke when the approval is someone else\'s', () => {
      mountLimited('someone-else')
      expect(button('Revoke approval')).toBeUndefined()
    })
  })
})
