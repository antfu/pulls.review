import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DiffReviewThreadsToggle from './DiffReviewThreadsToggle.vue'

const meta: Meta<typeof DiffReviewThreadsToggle> = {
  title: 'Diff/DiffReviewThreadsToggle',
  component: DiffReviewThreadsToggle,
}
export default meta

type Story = StoryObj<typeof DiffReviewThreadsToggle>

export const ThreadsShown: Story = {
  args: { showThreads: true },
}

export const ThreadsHidden: Story = {
  args: { showThreads: false },
}
