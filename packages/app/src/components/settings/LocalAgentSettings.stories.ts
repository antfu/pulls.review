import type { LocalAgentInfo } from '@pulls.review/core/local-rpc'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defaultLlmSettings } from '@pulls.review/core/analyze'
import { ref } from 'vue'
import { localAgentsKey } from '../../analyze/local-agents'
import LocalAgentSettings from './LocalAgentSettings.vue'

/** The agent list the `pulls.review` server would provide. */
function withAgents(agents: LocalAgentInfo[] | undefined): Story['decorators'] {
  return [() => ({ template: '<story />', provide: { [localAgentsKey as symbol]: ref(agents) } })]
}

const found: LocalAgentInfo[] = [
  { name: 'claude', label: 'Claude Code', version: '2.1.220', models: [{ id: 'sonnet', name: 'Sonnet (latest)' }, { id: 'opus', name: 'Opus (latest)' }] },
  { name: 'opencode', label: 'OpenCode', version: '1.18.29', models: [{ id: 'vercel/anthropic/claude-sonnet-4.5', name: 'vercel/anthropic/claude-sonnet-4.5' }] },
]

const meta: Meta<typeof LocalAgentSettings> = {
  title: 'Settings/LocalAgentSettings',
  component: LocalAgentSettings,
}
export default meta

type Story = StoryObj<typeof LocalAgentSettings>

export const Detecting: Story = {
  args: { llmSettings: { ...defaultLlmSettings, provider: 'local-agent' }, models: null },
  decorators: withAgents(undefined),
}

export const NoneFound: Story = {
  args: { llmSettings: { ...defaultLlmSettings, provider: 'local-agent' }, models: null },
  decorators: withAgents([]),
}

export const Unpicked: Story = {
  args: { llmSettings: { ...defaultLlmSettings, provider: 'local-agent' }, models: null },
  decorators: withAgents(found),
}

export const Picked: Story = {
  args: {
    llmSettings: { ...defaultLlmSettings, provider: 'local-agent', agent: 'claude', agentModel: 'opus' },
    models: [{ id: '', name: 'Agent default' }, ...found[0]!.models],
  },
  decorators: withAgents(found),
}
