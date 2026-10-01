import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockThread } from '../../../test/fixtures/mock-reviews'
import ReviewCommentCard from './ReviewCommentCard.vue'

const comment = mockThread().comments[0]!

const meta: Meta<typeof ReviewCommentCard> = {
  title: 'Diff/ReviewCommentCard',
  component: ReviewCommentCard,
  args: { comment, isViewer: false },
}
export default meta

type Story = StoryObj<typeof ReviewCommentCard>

export const Default: Story = {}

export const OwnComment: Story = {
  args: { isViewer: true },
}

export const Pending: Story = {
  args: {
    comment: { ...comment, pending: true },
    isViewer: true,
  },
}

export const GhostAuthor: Story = {
  args: {
    comment: { ...comment, author: undefined },
  },
}
