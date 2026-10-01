import type { Meta, StoryObj } from '@storybook/vue3-vite'
import FileStatus from './FileStatus.vue'

const meta: Meta<typeof FileStatus> = {
  title: 'Diff/FileStatus',
  component: FileStatus,
}
export default meta

type Story = StoryObj<typeof FileStatus>

export const Added: Story = { args: { status: 'added' } }
export const Removed: Story = { args: { status: 'removed' } }
export const Modified: Story = { args: { status: 'modified' } }
export const Renamed: Story = { args: { status: 'renamed' } }
export const Copied: Story = { args: { status: 'copied' } }
