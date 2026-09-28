import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffShareButton from './DiffShareButton.vue'

const meta: Meta<typeof DiffShareButton> = {
  title: 'Diff/DiffShareButton',
  component: DiffShareButton,
}
export default meta

type Story = StoryObj<typeof DiffShareButton>

export const NotSharedYet: Story = {
  args: { shared: createMockDiffsStore({ shared: {} }).shared! },
}

export const AlreadyShared: Story = {
  args: { shared: createMockDiffsStore({ shared: { ownComment: { id: 1, url: 'https://github.com/owner/repo/pull/1#issuecomment-1' } } }).shared! },
}

export const Sharing: Story = {
  args: { shared: createMockDiffsStore({ shared: { isSharing: true } }).shared! },
}

export const ReadOnlyToken: Story = {
  args: { shared: createMockDiffsStore({ shared: { canShare: false } }).shared! },
}

export const Failed: Story = {
  args: { shared: createMockDiffsStore({ shared: { error: new Error('Resource not accessible by personal access token') } }).shared! },
}
