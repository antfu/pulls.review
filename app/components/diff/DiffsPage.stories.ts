import type { Meta, StoryObj } from '@storybook/vue3-vite'
import real from '../../../test/fixtures/real/antfu-eslint-config-861.json'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import zeroFiles from '../../../test/fixtures/synthetic/zero-files.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffsPage from './DiffsPage.vue'

const meta: Meta<typeof DiffsPage> = {
  title: 'Diff/DiffsPage',
  component: DiffsPage,
}
export default meta

type Story = StoryObj<typeof DiffsPage>

export const Synthetic: Story = {
  args: {
    store: createMockDiffsStore({
      diff: partiallyReviewed.diff as any,
      grouped: partiallyReviewed.grouped as any,
      reviewed: partiallyReviewed.reviewedShas,
    }),
  },
}

export const NestedGroups: Story = {
  args: {
    store: createMockDiffsStore({
      diff: nestedGroups.diff as any,
      grouped: nestedGroups.grouped as any,
    }),
  },
}

export const RealPullRequest: Story = {
  args: {
    store: createMockDiffsStore({
      diff: real.diff as any,
      grouped: real.grouped as any,
    }),
  },
}

export const ZeroFiles: Story = {
  args: {
    store: createMockDiffsStore({
      diff: zeroFiles.diff as any,
      grouped: zeroFiles.grouped as any,
    }),
  },
}

/**
 * A GitHub load failure (e.g. a missing/expired token) surfaces the token field inline
 * in the error fallback - `reviews` marks the source as GitHub, which gates it on.
 */
export const GithubLoadError: Story = {
  args: {
    store: createMockDiffsStore({
      error: new Error('GitHub API request failed: 401 Bad credentials'),
      reviews: {},
    }),
  },
}

/** A paste failure has no token to fix, so the error fallback shows the message alone. */
export const PasteLoadError: Story = {
  args: {
    store: createMockDiffsStore({
      error: new Error('Could not parse this diff'),
    }),
  },
}
