import type { Meta, StoryObj } from '@storybook/vue3-vite'
import real from '../../../test/fixtures/real/antfu-eslint-config-861.json'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import staleAnalysis from '../../../test/fixtures/synthetic/stale-analysis.json'
import zeroFiles from '../../../test/fixtures/synthetic/zero-files.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffsPage from './DiffsPage.vue'

const meta: Meta<typeof DiffsPage> = {
  title: 'Diff/DiffsPage',
  component: DiffsPage,
}
export default meta

type Story = StoryObj<typeof DiffsPage>

const longFileList = Array.from({ length: 80 }, (_, index) => ({
  ...partiallyReviewed.diff.files[0],
  path: `packages/app/src/components/example-${index.toString().padStart(2, '0')}.ts`,
  sha: `sha-${index}`,
}))

export const Synthetic: Story = {
  args: {
    store: createMockDiffsStore({
      diff: partiallyReviewed.diff as any,
      grouped: partiallyReviewed.grouped as any,
      reviewed: partiallyReviewed.reviewedShas,
    }),
  },
}

export const MarkdownDescription: Story = {
  args: {
    store: createMockDiffsStore({
      diff: {
        ...partiallyReviewed.diff as any,
        description: [
          '## What changed',
          'Show **pull request descriptions** with [Markdown](https://commonmark.org/) formatting.',
          '- Review the context before reading the diff.\n- Use the navigation to jump between the description and code.',
          '```ts\nconst description = "A long code example that should scroll horizontally on narrow screens"\n```',
          '| Feature | Status |\n| --- | --- |\n| Description | Ready |',
          [
            '```mermaid',
            'stateDiagram-v2',
            '  direction LR',
            '  [*] --> Draft',
            '  Draft --> Open: mark ready',
            '  Open --> Analyzing: analyze',
            '  Analyzing --> Grouped: groups ready',
            '  Analyzing --> Open: analysis failed',
            '  state Review {',
            '    [*] --> Reading',
            '    Reading --> Commenting: add comment',
            '    Commenting --> Reading: submit',
            '    Reading --> [*]: all files reviewed',
            '  }',
            '  Grouped --> Review',
            '  Review --> ChangesRequested: request changes',
            '  ChangesRequested --> Open: new commits',
            '  Review --> Approved: approve',
            '  Approved --> Merged: merge',
            '  Open --> Closed: close',
            '  Merged --> [*]',
            '  Closed --> [*]',
            '```',
          ].join('\n'),
          ...Array.from({ length: 20 }, (_, index) => `### Detail ${index + 1}\nDescriptions stay visible in the page flow.`),
        ].join('\n\n'),
      },
      grouped: partiallyReviewed.grouped as any,
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

/** The diff moved on after the AI analysis: a removed file, a rename, and a new file landing in "Uncategorized". */
export const StaleAnalysis: Story = {
  args: {
    store: createMockDiffsStore({
      diff: staleAnalysis.diff as any,
      grouped: staleAnalysis.grouped as any,
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

export const LongFileList: Story = {
  args: {
    store: createMockDiffsStore({
      diff: { ...partiallyReviewed.diff, files: longFileList } as any,
      grouped: {
        ...partiallyReviewed.grouped,
        groups: [{
          ...partiallyReviewed.grouped.groups[0],
          filePaths: longFileList.map(file => file.path),
        }],
      } as any,
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
 * in the error fallback - the store's `auth` names the token as the fix.
 */
export const GithubLoadError: Story = {
  args: {
    store: createMockDiffsStore({
      error: new Error('GitHub API request failed: 401 Bad credentials'),
      auth: 'github-token',
    }),
  },
}

/** A paste failure has no token to fix, so the error fallback shows the message alone. */
export const PasteLoadError: Story = {
  args: {
    store: createMockDiffsStore({
      error: new Error('Could not parse this diff'),
      canRefresh: false,
    }),
  },
}
