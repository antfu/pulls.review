import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '../../i18n'
import CommentComposer from './CommentComposer.vue'

function mountComposer(props: { hasPendingReview: boolean, reviewMode?: boolean }) {
  const wrapper = mount(CommentComposer, { props, global: { plugins: [i18n] } })
  const labels = () => wrapper.findAll('button').map(button => button.text())
  return { wrapper, labels }
}

describe('commentComposer', () => {
  it('offers a single comment or a review by default', () => {
    expect(mountComposer({ hasPendingReview: false }).labels()).toEqual(['Cancel', 'Add single comment', 'Start a review'])
    expect(mountComposer({ hasPendingReview: true }).labels()).toEqual(['Cancel', 'Add review comment'])
  })

  it('posts at once, by button or shortcut, where the source has no pending reviews', async () => {
    const { wrapper, labels } = mountComposer({ hasPendingReview: false, reviewMode: false })
    expect(labels()).toEqual(['Cancel', 'Add single comment'])

    await wrapper.find('textarea').setValue('looks off')
    await wrapper.find('textarea').trigger('keydown.enter', { ctrlKey: true })
    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('submit')).toEqual([['looks off', 'single'], ['looks off', 'single']])
  })
})
