import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockMultiReplyThread, mockPendingThread, mockThread } from '../../../test/fixtures/mock-reviews'
import { createMockReviewsStore } from '../../stores/mock-diffs-store'
import ReviewThreadCard from './ReviewThreadCard.vue'

const meta: Meta<typeof ReviewThreadCard> = {
  title: 'Diff/ReviewThreadCard',
  component: ReviewThreadCard,
  args: {
    thread: mockThread(),
    reviews: createMockReviewsStore({ threads: [mockThread()] }),
  },
}
export default meta

type Story = StoryObj<typeof ReviewThreadCard>

export const SingleComment: Story = {}

export const MultiReply: Story = {
  args: { thread: mockMultiReplyThread() },
}

export const PendingDraft: Story = {
  args: { thread: mockPendingThread() },
}

export const Resolvable: Story = {
  args: { thread: mockThread({ threadId: 'PRRT_mock', resolved: false }) },
}

export const ReadOnly: Story = {
  args: { reviews: createMockReviewsStore({ canWrite: false }) },
}
