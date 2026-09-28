import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffAnalyzeButton from './DiffAnalyzeButton.vue'

const meta: Meta<typeof DiffAnalyzeButton> = {
  title: 'Diff/DiffAnalyzeButton',
  component: DiffAnalyzeButton,
}
export default meta

type Story = StoryObj<typeof DiffAnalyzeButton>

export const NotConfigured: Story = {
  args: { store: createMockDiffsStore({ isSetup: false }) },
}

export const ReadyToAnalyze: Story = {
  args: { store: createMockDiffsStore({ isSetup: true }) },
}

export const Analyzing: Story = {
  args: {
    store: createMockDiffsStore({
      isSetup: true,
      isAnalyzing: true,
      llmProgress: { step: 3, message: 'Reading 4 files: app/auth/session.ts, …' },
    }),
  },
}

export const Failed: Story = {
  args: {
    store: createMockDiffsStore({
      isSetup: true,
      llmError: new Error('401 Unauthorized: invalid x-api-key'),
    }),
  },
}
