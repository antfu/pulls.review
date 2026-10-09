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

const commits = [
  { sha: 'a1b2c3d4e5f6', message: 'feat: first step', author: { name: 'antfu', avatarUrl: 'https://github.com/antfu.png' }, date: '2026-01-01T00:00:00Z' },
  { sha: 'b2c3d4e5f6a1', message: 'fix: second step', author: { name: 'antfu', avatarUrl: 'https://github.com/antfu.png' }, date: '2026-01-02T00:00:00Z' },
]

export const WithCommits: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, isSetup: true }), commitNav: { commits, select: () => {} } },
}

export const ViewingOneCommit: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, isSetup: true }), commitNav: { commits, selected: commits[1]!.sha, select: () => {} } },
}

export const NoDescription: Story = {
  args: { store: createMockDiffsStore({ diff: zeroFiles.diff as any, grouped: zeroFiles.grouped as any, isSetup: true }) },
}
