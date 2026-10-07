import type { Meta, StoryObj } from '@storybook/vue3-vite'
import empty from '../../../test/fixtures/synthetic/empty-group.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import zeroFiles from '../../../test/fixtures/synthetic/zero-files.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffsHeader from './DiffsHeader.vue'

const meta: Meta<typeof DiffsHeader> = {
  title: 'Diff/DiffsHeader',
  component: DiffsHeader,
  args: {
    groupsVisable: [],
    scrollY: 0,
    descriptionId: 'pr-description',
  },
}
export default meta

type Story = StoryObj<typeof DiffsHeader>

export const Default: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, isSetup: true }) },
}

export const PartiallyReviewed: Story = {
  args: { store: createMockDiffsStore({ diff: partiallyReviewed.diff as any, grouped: partiallyReviewed.grouped as any, reviewed: partiallyReviewed.reviewedShas, changedSinceReviewed: ['src/b.ts'] }) },
}

export const NoDescription: Story = {
  args: { store: createMockDiffsStore({ diff: zeroFiles.diff as any, grouped: zeroFiles.grouped as any, isSetup: true }) },
}
