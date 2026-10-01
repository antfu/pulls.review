import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import AnalyzeStatusModal from './AnalyzeStatusModal.vue'

const meta: Meta<typeof AnalyzeStatusModal> = {
  title: 'Diff/AnalyzeStatusModal',
  component: AnalyzeStatusModal,
  args: { open: true },
}
export default meta

type Story = StoryObj<typeof AnalyzeStatusModal>

const analysisTranscript: AgentMessage[] = [
  { role: 'system', content: 'You group pull request diffs.', timestamp: 0 },
  { role: 'user', content: 'Manifest: …', timestamp: 0 },
  fauxAssistantMessage([
    fauxText('Starting with the auth changes, then the store.'),
    fauxToolCall('read_diffs', { paths: ['app/auth/session.ts', 'app/auth/store.ts'] }),
  ], { stopReason: 'toolUse' }),
  { role: 'toolResult', toolCallId: 'read', toolName: 'read_diffs', content: [{ type: 'text', text: '…' }], isError: false, timestamp: 0 },
  fauxAssistantMessage(fauxToolCall('submit_grouping', { groups: [] }), { stopReason: 'toolUse' }),
  { role: 'toolResult', toolCallId: 'submit', toolName: 'submit_grouping', content: [{ type: 'text', text: 'Missing paths: app/auth/store.ts\nFix these and call submit_grouping again.' }], isError: true, timestamp: 0 },
]

export const Analyzing: Story = {
  args: {
    store: createMockDiffsStore({
      isAnalyzing: true,
      llmProgress: { step: 3, message: 'Organizing groups…' },
      llmTranscript: [...analysisTranscript, fauxAssistantMessage('Fixing the missing path and resub', { stopReason: 'pending' })],
    }),
  },
}

export const JustStarted: Story = {
  args: { store: createMockDiffsStore({ isAnalyzing: true }) },
}

export const Failed: Story = {
  args: {
    store: createMockDiffsStore({
      llmError: new Error('Agent did not submit a grouping'),
      llmTranscript: analysisTranscript,
    }),
  },
}

export const FailedBeforeStart: Story = {
  args: { store: createMockDiffsStore({ llmError: new Error('401 Unauthorized: invalid x-api-key') }) },
}
