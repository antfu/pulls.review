import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { GroupedResult } from '../../types/analyze'
import nested from '../../../test/fixtures/synthetic/nested-groups.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffShareButton from './DiffShareButton.vue'

const meta: Meta<typeof DiffShareButton> = {
  title: 'Diff/DiffShareButton',
  component: DiffShareButton,
}
export default meta

type Story = StoryObj<typeof DiffShareButton>

const grouped = { ...nested.grouped, source: 'llm', model: 'anthropic/claude-sonnet-4' } as GroupedResult
const ownComment = { id: 1, url: 'https://github.com/owner/repo/pull/1#issuecomment-1' }

function store(shared: Parameters<typeof createMockDiffsStore>[0]['shared']) {
  return createMockDiffsStore({ diff: nested.diff as any, grouped, shared })
}

export const NotSharedYet: Story = {
  args: { store: store({}) },
}

export const AlreadyShared: Story = {
  args: { store: store({ ownComment }) },
}

export const Sharing: Story = {
  args: { store: store({ isSharing: true }) },
}

export const ReadOnlyToken: Story = {
  args: { store: store({ canShare: false }) },
}

export const Failed: Story = {
  args: { store: store({ error: new Error('Resource not accessible by personal access token') }) },
}
