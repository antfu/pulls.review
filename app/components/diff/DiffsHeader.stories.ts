import type { Meta, StoryObj } from '@storybook/vue3-vite'
import empty from '../../../test/fixtures/synthetic/empty-group.json'
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

export const NoDescription: Story = {
  args: { store: createMockDiffsStore({ diff: zeroFiles.diff as any, grouped: zeroFiles.grouped as any, isSetup: true }) },
}

export const AiNotConfigured: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: { ...empty.grouped, source: 'llm' } as any, isSetup: false }) },
}

export const AiReady: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: { ...empty.grouped, source: 'llm' } as any, isSetup: true }) },
}

export const AiAnalyzing: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: { ...empty.grouped, source: 'llm' } as any, isSetup: true, isAnalyzing: true, llmProgress: { step: 3, message: 'Reading 4 files: app/auth/session.ts, …' } }) },
}

export const AiFailed: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: { ...empty.grouped, source: 'llm' } as any, isSetup: true, llmError: new Error('401 Unauthorized: invalid x-api-key') }) },
}

export const Embedded: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, llm: false, isEmbedded: true }) },
}
