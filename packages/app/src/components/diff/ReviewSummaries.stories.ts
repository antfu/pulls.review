import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockSummaries } from '../../../test/fixtures/mock-reviews'
import ReviewSummaries from './ReviewSummaries.vue'

const meta: Meta<typeof ReviewSummaries> = {
  title: 'Diff/ReviewSummaries',
  component: ReviewSummaries,
  args: { summaries: mockSummaries },
}
export default meta

type Story = StoryObj<typeof ReviewSummaries>

export const Default: Story = {}

export const Empty: Story = {
  args: { summaries: [] },
}
