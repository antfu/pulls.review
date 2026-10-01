import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DiffReviewButton from './DiffReviewButton.vue'

const meta: Meta<typeof DiffReviewButton> = {
  title: 'Diff/DiffReviewButton',
  component: DiffReviewButton,
}
export default meta

type Story = StoryObj<typeof DiffReviewButton>

export const Default: Story = {
  args: { pendingCommentCount: 0 },
}

export const WithPendingComments: Story = {
  args: { pendingCommentCount: 3 },
}
