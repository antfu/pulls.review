import type { Meta, StoryObj } from '@storybook/vue3-vite'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import zeroFiles from '../../../test/fixtures/synthetic/zero-files.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import FileTree from './FileTree.vue'

const meta: Meta<typeof FileTree> = {
  title: 'Diff/FileTree',
  component: FileTree,
  args: { filesVisible: [], layout: 'tree' },
}
export default meta

type Story = StoryObj<typeof FileTree>

export const Default: Story = {
  args: { files: partiallyReviewed.diff.files as any, store: createMockDiffsStore({ reviewed: partiallyReviewed.reviewedShas }) },
}

export const ChangedSinceReviewed: Story = {
  args: { files: partiallyReviewed.diff.files as any, store: createMockDiffsStore({ reviewed: partiallyReviewed.reviewedShas, changedSinceReviewed: ['src/b.ts'] }) },
}

/** A file carrying a critical analysis note gets the warning mark next to its name. */
export const Critical: Story = {
  args: {
    files: partiallyReviewed.diff.files as any,
    notes: new Map([[(partiallyReviewed.diff.files[0] as any).sha, [{ text: 'Careful here.', critical: true }]]]),
    store: createMockDiffsStore({}),
  },
}

export const List: Story = {
  args: { ...Default.args, layout: 'list' },
}

export const Empty: Story = {
  args: { files: zeroFiles.diff.files as any, store: createMockDiffsStore({}) },
}
