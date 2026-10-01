import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockPendingReview, mockPendingThread } from '../../../test/fixtures/mock-reviews'
import { createMockReviewsStore } from '../../stores/mock-diffs-store'
import ReviewSubmitModal from './ReviewSubmitModal.vue'

const meta: Meta<typeof ReviewSubmitModal> = {
  title: 'Diff/ReviewSubmitModal',
  component: ReviewSubmitModal,
  args: {
    open: true,
    reviews: createMockReviewsStore({}),
  },
}
export default meta

type Story = StoryObj<typeof ReviewSubmitModal>

export const FreshReview: Story = {}

export const WithPendingComments: Story = {
  args: {
    reviews: createMockReviewsStore({
      threads: [mockPendingThread()],
      pendingReview: mockPendingReview,
    }),
  },
}
