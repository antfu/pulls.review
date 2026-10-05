import type { Meta, StoryObj } from '@storybook/vue3-vite'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import staleAnalysis from '../../../test/fixtures/synthetic/stale-analysis.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffGroup from './DiffGroup.vue'
import { resolveGroups } from './group-utils'

const meta: Meta<typeof DiffGroup> = {
  title: 'Diff/DiffGroup',
  component: DiffGroup,
  args: { collapsed: false, filesVisible: [] },
}
export default meta

type Story = StoryObj<typeof DiffGroup>

export const Default: Story = {
  args: {
    group: resolveGroups(partiallyReviewed.grouped.groups as any, partiallyReviewed.diff.files as any)[0]!,
    store: createMockDiffsStore({ reviewed: partiallyReviewed.reviewedShas }),
  },
}

export const WithNestedChildren: Story = {
  args: {
    group: resolveGroups(nestedGroups.grouped.groups as any, nestedGroups.diff.files as any)[0]!,
    store: createMockDiffsStore({}),
  },
}

/** An analysis from an older commit: one path resolved via its rename, one no longer in the diff. */
export const WithRemovedFiles: Story = {
  args: {
    group: resolveGroups(staleAnalysis.grouped.groups as any, staleAnalysis.diff.files as any)[0]!,
    store: createMockDiffsStore({}),
  },
}

export const Collapsed: Story = {
  args: {
    group: resolveGroups(partiallyReviewed.grouped.groups as any, partiallyReviewed.diff.files as any)[0]!,
    store: createMockDiffsStore({ reviewed: partiallyReviewed.reviewedShas }),
    collapsed: true,
  },
}
