import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DiffStats from './DiffStats.vue'

const meta: Meta<typeof DiffStats> = {
  title: 'Diff/DiffStats',
  component: DiffStats,
}
export default meta

type Story = StoryObj<typeof DiffStats>

export const Default: Story = {
  args: { additions: 42, deletions: 7 },
}

export const OnlyAdditions: Story = {
  args: { additions: 12, deletions: 0 },
}
