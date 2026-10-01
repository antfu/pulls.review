import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffAnalyzeButton from './DiffAnalyzeButton.vue'

const meta: Meta<typeof DiffAnalyzeButton> = {
  title: 'Diff/DiffAnalyzeButton',
  component: DiffAnalyzeButton,
}
export default meta

type Story = StoryObj<typeof DiffAnalyzeButton>

const analysisTranscript: AgentMessage[] = [
  fauxAssistantMessage([
    fauxText('Starting with the auth changes.'),
    fauxToolCall('read_diffs', { paths: ['app/auth/session.ts'] }),
  ], { stopReason: 'toolUse' }),
]

export const NotConfigured: Story = {
  args: { store: createMockDiffsStore({ isSetup: false }) },
}

export const ReadyToAnalyze: Story = {
  args: { store: createMockDiffsStore({ isSetup: true }) },
}

/** Click the button to open the live status dialog. */
export const Analyzing: Story = {
  args: {
    store: createMockDiffsStore({
      isSetup: true,
      isAnalyzing: true,
      llmProgress: { step: 3, message: 'Reading 4 files: app/auth/session.ts, …' },
      llmTranscript: analysisTranscript,
    }),
  },
}

/** Click the button to open the error dialog. */
export const Failed: Story = {
  args: {
    store: createMockDiffsStore({
      isSetup: true,
      llmError: new Error('401 Unauthorized: invalid x-api-key'),
      llmTranscript: analysisTranscript,
    }),
  },
}
