import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { ResolvedNote } from './group-utils'
import { mockMultiReplyThread, mockPendingThread, mockThread } from '../../../test/fixtures/mock-reviews'
import binaryFile from '../../../test/fixtures/synthetic/binary-file.json'
import hugeFile from '../../../test/fixtures/synthetic/huge-file.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import renamedFile from '../../../test/fixtures/synthetic/renamed-file.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import FileDiff from './FileDiff.vue'

const meta: Meta<typeof FileDiff> = {
  title: 'Diff/FileDiff',
  component: FileDiff,
  args: { store: createMockDiffsStore({}) },
}
export default meta

type Story = StoryObj<typeof FileDiff>

const notes: ResolvedNote[] = [
  { text: 'Replaces the old constant with a derived value; every caller now sees the new default.', critical: true },
  { text: 'This line is read before the config is loaded, so it still sees the fallback.', critical: false, anchor: { side: 'additions', line: 2 } },
  { text: 'The removed branch handled the legacy format; nothing else does now.', critical: true, anchor: { side: 'deletions', line: 2 } },
]

export const Modified: Story = {
  args: { file: partiallyReviewed.diff.files[0] as any },
}

export const Reviewed: Story = {
  args: { file: partiallyReviewed.diff.files[0] as any, store: createMockDiffsStore({ reviewed: [(partiallyReviewed.diff.files[0] as any).sha] }) },
}

export const ChangedSinceReviewed: Story = {
  args: { file: partiallyReviewed.diff.files[0] as any, store: createMockDiffsStore({ changedSinceReviewed: [(partiallyReviewed.diff.files[0] as any).path] }) },
}

export const Split: Story = {
  args: { file: partiallyReviewed.diff.files[0] as any, store: createMockDiffsStore({ layout: 'split' }) },
}

/** A source that can fetch full files: the header offers "load full file". */
export const LoadFullFile: Story = {
  args: {
    file: partiallyReviewed.diff.files[0] as any,
    store: createMockDiffsStore({
      fileContent: {
        old: 'context\nold\nconst untouched = true\n',
        new: 'context\nnew\nextra\nconst untouched = true\n',
      },
    }),
  },
}

const longFileLines = Array.from({ length: 60 }, (_, index) => `const line${index + 1} = ${index + 1}`)

/** A hunk in the middle of a file: the "N unmodified lines" controls show without loading the file first. */
export const ExpandUnmodified: Story = {
  args: {
    file: {
      path: 'src/long.ts',
      status: 'modified',
      additions: 1,
      deletions: 1,
      isBinary: false,
      sha: 'sha-long',
      hunks: [{
        header: '@@ -27,7 +27,7 @@',
        oldStart: 27,
        oldLines: 7,
        newStart: 27,
        newLines: 7,
        patch: [
          ...longFileLines.slice(26, 29).map(line => ` ${line}`),
          `-${longFileLines[29]}`,
          '+const line30 = 300',
          ...longFileLines.slice(30, 33).map(line => ` ${line}`),
        ].join('\n'),
      }],
    },
    store: createMockDiffsStore({
      fileContent: {
        old: longFileLines.join('\n'),
        new: longFileLines.with(29, 'const line30 = 300').join('\n'),
      },
    }),
  },
}

/** A patch too large to keep: counts only, with "load full file" to see it. */
export const Truncated: Story = {
  args: {
    file: { ...partiallyReviewed.diff.files[0], hunks: [], truncated: true } as any,
    store: createMockDiffsStore({ fileContent: { old: 'context\nold\n', new: 'context\nnew\nextra\n' } }),
  },
}

export const Renamed: Story = {
  args: { file: renamedFile.diff.files[0] as any },
}

export const Binary: Story = {
  args: { file: binaryFile.diff.files[0] as any },
}

export const Huge: Story = {
  args: { file: hugeFile.diff.files[0] as any },
}

/** Analysis notes: one for the whole file under the header, one inline per annotated line. */
export const WithNotes: Story = {
  args: { file: partiallyReviewed.diff.files[0] as any, notes },
}

/** A note and a review thread anchored on the same line stack in one annotation row. */
export const WithNotesAndThreads: Story = {
  args: {
    file: partiallyReviewed.diff.files[0] as any,
    notes,
    store: createMockDiffsStore({ reviews: { threads: [mockThread()] } }),
  },
}

export const WithThreads: Story = {
  args: {
    file: partiallyReviewed.diff.files[0] as any,
    store: createMockDiffsStore({
      reviews: { threads: [mockThread(), mockMultiReplyThread(), mockPendingThread()] },
    }),
  },
}

export const ReadOnlyThreads: Story = {
  args: {
    file: partiallyReviewed.diff.files[0] as any,
    store: createMockDiffsStore({
      reviews: { threads: [mockThread()], canWrite: false },
    }),
  },
}
