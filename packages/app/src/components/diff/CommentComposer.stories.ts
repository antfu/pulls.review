import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CommentComposer from './CommentComposer.vue'

const meta: Meta<typeof CommentComposer> = {
  title: 'Diff/CommentComposer',
  component: CommentComposer,
  args: { hasPendingReview: false },
}
export default meta

type Story = StoryObj<typeof CommentComposer>

export const Fresh: Story = {}

export const PendingReviewActive: Story = {
  args: { hasPendingReview: true },
}

export const Failed: Story = {
  args: { error: 'This token cannot write reviews on this repository.' },
}
